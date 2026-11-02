import { registeredCompiledCardFingerprints } from "#api/engine/effects/interpreter/registration/RegisteredCompiledCardFingerprints";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { CompiledCard } from "@aegis/shared";
import { registeredCompiledCards } from "#api/engine/effects/interpreter/compiledCards";

let codeFingerprint: string | undefined;
let registeredCardsRevision = -1;
let immutableCardsFingerprint = "";
let mutableCompiledCards: [string, CompiledCard][] = [];
let immutableRegistryFingerprint: string | undefined;

export function getEngineCodeFingerprint(): string {
  if (codeFingerprint === undefined) {
    const hash = createHash("sha256");
    const roots = [
      fileURLToPath(new URL("../../", import.meta.url)),
      dirname(dirname(fileURLToPath(import.meta.resolve("@aegis/shared/schema/GameState")))),
    ];
    for (const [index, root] of roots.entries()) {
      visit(root);
      function visit(directory: string): void {
        for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
          left.name.localeCompare(right.name),
        )) {
          const path = join(directory, entry.name);
          if (entry.isDirectory()) {
            visit(path);
          } else if (
            entry.isFile() &&
            /\.(?:ts|js|json)$/.test(entry.name) &&
            !/\.(?:test|spec|d)\.(?:ts|js)$/.test(entry.name)
          ) {
            hash.update(`${index}/${relative(root, path)}\0`);
            hash.update(readFileSync(path));
            hash.update("\0");
          }
        }
      }
    }
    hash.update(readFileSync(new URL("../../../package.json", import.meta.url)));
    hash.update(readFileSync(new URL("../../../../../pnpm-lock.yaml", import.meta.url)));
    hash.update(process.versions.node);
    codeFingerprint = hash.digest("hex");
  }
  if (registeredCardsRevision !== registeredCompiledCards.revision) {
    const immutableHash = createHash("sha256");
    mutableCompiledCards = [];
    for (const [cardId, program] of [...registeredCompiledCards].sort(([left], [right]) => left.localeCompare(right))) {
      const compiledFingerprint = registeredCompiledCardFingerprints.get({ compiled: program });
      if (compiledFingerprint === undefined) {
        mutableCompiledCards.push([cardId, program]);
      } else {
        immutableHash.update(cardId);
        immutableHash.update("\0");
        immutableHash.update(compiledFingerprint);
        immutableHash.update("\0");
      }
    }
    immutableCardsFingerprint = immutableHash.digest("hex");
    registeredCardsRevision = registeredCompiledCards.revision;
    immutableRegistryFingerprint =
      mutableCompiledCards.length === 0
        ? createHash("sha256").update(codeFingerprint).update(immutableCardsFingerprint).digest("hex")
        : undefined;
  }
  if (immutableRegistryFingerprint !== undefined) return immutableRegistryFingerprint;
  const hash = createHash("sha256").update(codeFingerprint).update(immutableCardsFingerprint);
  for (const [cardId, program] of mutableCompiledCards) {
    hash.update(cardId);
    hash.update("\0");
    hash.update(JSON.stringify(program));
    hash.update("\0");
  }
  return hash.digest("hex");
}
