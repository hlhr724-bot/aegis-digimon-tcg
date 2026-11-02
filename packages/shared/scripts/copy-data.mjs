#!/usr/bin/env node
/**
 * Copy committed JSON data assets from `src/` to `dist/` after `tsc`.
 *
 * `tsc` compiles the `.ts` modules but does not copy `.json` files, so the
 * generated card data (`src/cards/data/cards.json`) must be mirrored into the
 * build output for the published package to resolve `import "./cards.json"` at
 * runtime (ARCHITECTURE.md section 7: committed data, no network dependency).
 */

import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");

const jsonAssets = [
  "cards/data/cards.json",
  "cards/data/arts.json",
  "cards/data/regional-arts.json",
  "effects/effects.json",
  "effects/generated-digivolve-overrides.json",
];

for (const relPath of jsonAssets) {
  const from = join(packageRoot, "src", relPath);
  const to = join(packageRoot, "dist", relPath);
  if (!existsSync(from)) {
    console.error(`copy-data: source missing, skipping: ${from}`);
    process.exitCode = 1;
    continue;
  }
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  console.log(`copy-data: ${relPath} -> dist`);
}
