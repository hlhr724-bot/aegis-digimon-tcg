import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guard: the ONLY place allowed to mutate a zone array directly is the mutation seam
 * (state/access.ts). Every other engine file must move cards through the seam's
 * exported functions (insertCard/extractCardById/takeTop/…), so zone-mutation
 * invariants have exactly one home. Mirrors the repo's regen:check convention:
 * drift becomes a build failure, not a silent leak.
 *
 * Ratchet: `MIGRATION_PENDING` lists files not yet routed through the seam. Offenders
 * must be a subset of it. Remove a file from the set as it is migrated; when the set
 * is empty and no offenders remain, the seam is fully enforced. A new raw mutation in
 * an already-migrated (or brand-new) file fails immediately.
 *
 * The set is now empty: the seam is fully enforced. Any raw zone push/splice/shift
 * outside state/access.ts is a build failure — route it through the seam instead.
 */

const ENGINE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The seam itself — the one file permitted to touch zone arrays directly. */
const SEAM_FILE = "state/access.ts";

/** Files still awaiting migration onto the seam. Shrinks to empty as work lands. */
const MIGRATION_PENDING = new Set<string>([]);

/**
 * Raw mutation of a zone ARRAY: the loose zones, the battle area, and the two card
 * collections a Permanent owns (`stack`, `linked`).
 */
const ZONE_ARRAY_MUTATION =
  /\.(deck|hand|security|battleArea|trash|breeding|eggDeck|delayZone|stack|linked)\.(push|splice|pop|shift|unshift|clear|setAt)\b/;

/**
 * Raw ASSIGNMENT to a state field that holds cards. An array regex cannot catch these —
 * `permanent.topCard = card` moves a card just as surely as a push does, and for a long time
 * these were the seam's blind spot: ~50 sites moved cards into permanents without any
 * bookkeeping, which is why per-viewer visibility had to be recomputed by re-walking the whole
 * board before every patch.
 *
 * `[^=]` after the `=` keeps `===`/`==` comparisons out. The `this.` exclusion on `breeding` is
 * for `GameEngine.breeding`, which is the BreedingPhaseController, not the raising-area slot.
 */
const ZONE_FIELD_ASSIGNMENT = /(?:(?<!this)\.breeding|\.topCard|\.resolvingOption)\s*=[^=]/;

function hasRawMutation(source: string): boolean {
  return ZONE_ARRAY_MUTATION.test(source) || ZONE_FIELD_ASSIGNMENT.test(source);
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

function offendingFiles(): string[] {
  const offenders = new Set<string>();
  for (const file of sourceFiles(ENGINE_DIR)) {
    const rel = relative(ENGINE_DIR, file).replace(/\\/g, "/");
    if (rel === SEAM_FILE) continue;
    if (hasRawMutation(readFileSync(file, "utf8"))) offenders.add(rel);
  }
  return [...offenders].sort();
}

describe("mutation seam guard", () => {
  it("permits raw zone mutation only in files still pending migration", () => {
    const stragglers = offendingFiles().filter((file) => !MIGRATION_PENDING.has(file));
    expect(stragglers).toEqual([]);
  });

  it("does not list already-migrated files as pending", () => {
    const migratedButListed = [...MIGRATION_PENDING].filter((file) => !offendingFiles().includes(file));
    expect(migratedButListed).toEqual([]);
  });
});
