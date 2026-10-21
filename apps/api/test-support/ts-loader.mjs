import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deserialize, serialize } from "node:v8";
import { transformSync } from "oxc-transform";
import { loadManifest, stubSource } from "./cards-bundle.mjs";

// Reading ~5,000 small source files costs ~1s in syscalls alone, so every transformed module
// lives in one cache file keyed by path and validated by mtime + size.
const cachePath = fileURLToPath(new URL("../node_modules/.cache/ts-loader.v8", import.meta.url));
const cache = loadCache();
let dirty = false;
const bundledCards = process.env.AEGIS_CARDS_BUNDLE === "0" ? undefined : loadManifest();

function loadCache() {
  try {
    return deserialize(readFileSync(cachePath));
  } catch {
    return new Map();
  }
}

process.once("exit", () => {
  if (!dirty) return;
  // Workers exit concurrently; rename keeps each write atomic and the last one wins.
  const temporaryPath = `${cachePath}.${process.pid}`;
  try {
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(temporaryPath, serialize(cache));
    renameSync(temporaryPath, cachePath);
  } catch {}
});

function transformedSource(path) {
  const { mtimeMs, size } = statSync(path);
  const cached = cache.get(path);
  if (cached && cached.mtimeMs === mtimeMs && cached.size === size) return cached.code;
  const { code, errors } = transformSync(path, readFileSync(path, "utf8"), {
    sourceType: "module",
    sourcemap: false,
    decorator: { legacy: true },
    typescript: { onlyRemoveTypeImports: false },
  });
  if (errors.length) throw new Error(`${path}: ${errors[0].message}`);
  cache.set(path, { mtimeMs, size, code });
  dirty = true;
  return code;
}

registerHooks({
  // Source imports use the emitted `.js` specifier; point it at the `.ts` file when only that exists.
  resolve(specifier, context, nextResolve) {
    const parentURL =
      context.parentURL && /^[A-Za-z]:[\\/]/.test(context.parentURL)
        ? pathToFileURL(context.parentURL).href
        : context.parentURL;
    const resolvedContext = parentURL === context.parentURL ? context : { ...context, parentURL };
    if (specifier.startsWith(".") && specifier.endsWith(".js") && parentURL?.startsWith("file:")) {
      const tsUrl = new URL(specifier.slice(0, -3) + ".ts", parentURL);
      if (existsSync(fileURLToPath(tsUrl))) return nextResolve(tsUrl.href, resolvedContext);
    }
    const moduleSpecifier = /^[A-Za-z]:[\\/]/.test(specifier) ? pathToFileURL(specifier).href : specifier;
    return nextResolve(moduleSpecifier, resolvedContext);
  },
  load(url, context, nextLoad) {
    const moduleUrl = /^[A-Za-z]:[\\/]/.test(url) ? pathToFileURL(url).href : url;
    if (!moduleUrl.startsWith("file:") || !moduleUrl.endsWith(".ts") || moduleUrl.includes("/node_modules/"))
      return nextLoad(moduleUrl, context);
    const path = fileURLToPath(moduleUrl);
    const bundled = bundledCards?.[path];
    if (bundled) return { format: "module", source: stubSource(bundled), shortCircuit: true };
    return { format: "module", source: transformedSource(path), shortCircuit: true };
  },
});
