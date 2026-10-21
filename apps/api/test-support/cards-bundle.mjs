import { createHash } from "node:crypto";
import { existsSync, globSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const apiRoot = fileURLToPath(new URL("..", import.meta.url));
const cardsRoot = resolve(apiRoot, "src/cards");
const cacheDirectory = resolve(apiRoot, "node_modules/.cache/cards-bundle");
const nodeTarget = "node26";
export const manifestPath = resolve(cacheDirectory, "manifest.json");

/**
 * Card modules (`src/cards/<SET>/**`, excluding tests and `*.testSupport.ts` helpers) are data
 * plus one `registerIrCard` call. Helpers stay unbundled because some import `../index.js`,
 * which would make a set's bundle import itself.
 * Loading ~4,700 of them as separate ES modules costs ~0.5s per worker in module overhead alone,
 * so each set is bundled into one module. One bundle per set, not one for all cards, keeps a
 * focused run that imports a single card from loading every set. Each set has its own
 * fingerprint, so editing one card only rebuilds that set. Everything outside the set stays
 * external and is imported by absolute path, so the engine singletons they register into
 * are the same instances the tests import.
 */
function cardModulesBySet() {
  const files = globSync("src/cards/*/**/*.ts", { cwd: apiRoot })
    .filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".testSupport.ts"))
    .map((file) => resolve(apiRoot, file))
    .sort();
  const sets = new Map();
  for (const file of files) {
    const set = relative(cardsRoot, file).split(sep)[0];
    if (!sets.has(set)) sets.set(set, []);
    sets.get(set).push(file);
  }
  return sets;
}

function fingerprints(sets) {
  const all = createHash("sha1");
  const bundlerSource = readFileSync(fileURLToPath(import.meta.url));
  all.update(nodeTarget);
  all.update(bundlerSource);
  const bySet = {};
  for (const [set, files] of sets) {
    const local = createHash("sha1");
    local.update(nodeTarget);
    local.update(bundlerSource);
    for (const file of files) {
      const { mtimeMs, size } = statSync(file);
      const fact = `${file}\0${mtimeMs}\0${size}\n`;
      all.update(fact);
      local.update(fact);
    }
    bySet[set] = local.digest("hex");
  }
  return { key: all.digest("hex"), bySet };
}

function bundlePathFor(set) {
  return resolve(cacheDirectory, `${set}.mjs`);
}

function resolveLocalModule({ specifier, resolveDirectory }) {
  let base;
  if (specifier.startsWith("#api/")) {
    base = resolve(apiRoot, "src", specifier.slice("#api/".length));
    if (!base.endsWith(".ts") && !base.endsWith(".js")) base += ".ts";
  } else if (isAbsolute(specifier)) {
    base = specifier;
  } else if (specifier.startsWith(".")) {
    base = resolve(resolveDirectory, specifier);
  } else {
    return undefined;
  }
  if (base.endsWith(".js") && existsSync(base.slice(0, -3) + ".ts")) return base.slice(0, -3) + ".ts";
  return base;
}

export async function buildCardsBundle() {
  const sets = cardModulesBySet();
  const { key, bySet } = fingerprints(sets);
  let previous;
  try {
    previous = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {}
  const bundlesExist = [...sets.keys()].every((set) => existsSync(bundlePathFor(set)));
  const setKeysMatch =
    previous?.bySet === undefined || [...sets.keys()].every((set) => previous.bySet[set] === bySet[set]);
  if (previous?.key === key && previous.modules !== undefined && bundlesExist && setKeysMatch) {
    // Upgrade the prior global-only manifest without rebuilding its valid bundles.
    if (previous.bySet === undefined) writeManifest({ key, bySet, modules: previous.modules });
    return;
  }

  const dirtySets = [...sets].filter(
    ([set]) => previous?.bySet?.[set] !== bySet[set] || !existsSync(bundlePathFor(set)),
  );
  const unchangedSets = new Set([...sets.keys()].filter((set) => !dirtySets.some(([dirty]) => dirty === set)));
  const modules = Object.fromEntries(
    Object.entries(previous?.modules ?? {}).filter(([, entry]) => unchangedSets.has(entry.set)),
  );
  if (dirtySets.length === 0) {
    writeManifest({ key, bySet, modules });
    return;
  }

  const { build } = await import("esbuild");
  const { transformSync } = await import("oxc-transform");
  const { init, parse } = await import("es-module-lexer");
  await init;

  mkdirSync(cacheDirectory, { recursive: true });
  await Promise.all(
    dirtySets.map(async ([set, files]) => {
      const bundled = new Set(files);
      const index = resolve(cardsRoot, set, "index.ts");
      const entryLines = bundled.has(index) ? [`import ${JSON.stringify(index)};`] : [];
      files.forEach((file, position) => {
        const { code } = transformSync(file, readFileSync(file, "utf8"), { sourceType: "module" });
        const [, exports, , hasModuleSyntax] = parse(code);
        const names = exports.filter((entry) => !entry.typeOnly).map((entry) => entry.name);
        // `export *` names are unknown until link time; such a module is left out of the bundle.
        if (!hasModuleSyntax || exports.some((entry) => entry.type !== "direct")) {
          bundled.delete(file);
          return;
        }
        modules[file] = { set, namespace: `m${position}`, exports: names };
        entryLines.push(`export * as m${position} from ${JSON.stringify(file)};`);
      });
      const temporaryBundle = `${bundlePathFor(set)}.${process.pid}`;
      await build({
        stdin: { contents: entryLines.join("\n"), resolveDir: apiRoot, loader: "js", sourcefile: `${set}-entry.js` },
        bundle: true,
        format: "esm",
        platform: "node",
        target: nodeTarget,
        outfile: temporaryBundle,
        logLevel: "error",
        tsconfigRaw: { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false } },
        plugins: [
          {
            name: "externalize-other-modules",
            setup(pluginBuild) {
              pluginBuild.onResolve({ filter: /.*/ }, (args) => {
                if (args.kind === "entry-point") return undefined;
                const file = resolveLocalModule({ specifier: args.path, resolveDirectory: args.resolveDir });
                if (file === undefined) return { path: args.path, external: true };
                if (bundled.has(file)) return { path: file };
                return { path: pathToFileURL(file).href, external: true };
              });
            },
          },
        ],
      });
      renameSync(temporaryBundle, bundlePathFor(set));
    }),
  );
  writeManifest({ key, bySet, modules });
}

function writeManifest(manifest) {
  mkdirSync(cacheDirectory, { recursive: true });
  const temporaryManifest = `${manifestPath}.${process.pid}`;
  writeFileSync(temporaryManifest, JSON.stringify(manifest));
  renameSync(temporaryManifest, manifestPath);
}

export function loadManifest() {
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8")).modules;
  } catch {
    return undefined;
  }
}

export function stubSource(entry) {
  const bundleUrl = JSON.stringify(pathToFileURL(bundlePathFor(entry.set)).href);
  const lines = [`import { ${entry.namespace} as namespace } from ${bundleUrl};`];
  for (const name of entry.exports) {
    lines.push(name === "default" ? "export default namespace.default;" : `export const ${name} = namespace.${name};`);
  }
  return lines.join("\n");
}
