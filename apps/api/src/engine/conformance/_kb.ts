import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Loader and citation registry for the rules knowledge base
 * (`data/kb/rules-index.json`) — the Comprehensive Rules, Official Rule
 * Manual, and Glossary, chunked and scraped from world.digimoncard.com by
 * `tools/kb/index-rules.mjs`. KB "conformance" tests cite specific chunk ids as the
 * source of truth for a mechanic, rather than re-deriving behavior from card text
 * or guessing. See `README.md` in this directory for the full design writeup,
 * including why chunk ids are positional and what that means for citation
 * stability.
 *
 * Path resolution: this file resolves the repo root from its own module URL
 * (`apps/api/src/engine/conformance/_kb.ts` is five directories below the repo
 * root) rather than trusting `process.cwd()`, so it works the same whether vitest
 * is invoked from the repo root, `apps/api/`, or anywhere else. This mirrors the
 * pattern already used by `src/engine/effectlessManifest.test.ts` (one directory
 * shallower, hence one fewer `..`).
 */

export interface RuleChunk {
  id: string;
  source: "comprehensive" | "manual" | "glossary";
  sourceTitle: string;
  section: string | null;
  title: string;
  text: string;
}

export interface RuleSource {
  id: string;
  url: string;
  title: string;
}

export interface RuleIndex {
  sources: RuleSource[];
  chunks: RuleChunk[];
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const RULE_INDEX_PATH = join(ROOT, "data/kb/rules-index.json");

// This module's own file path, used by `callerFile()` below to skip past its own
// stack frames and find the actual calling test file.
const SELF_FILE = fileURLToPath(import.meta.url);

let cachedIndex: RuleIndex | undefined;
let chunksById: Map<string, RuleChunk> | undefined;

/** Load (and cache) the parsed rules index. Safe to call repeatedly/from many files. */
export function loadRuleIndex(): RuleIndex {
  if (cachedIndex && chunksById) return cachedIndex;
  const raw = readFileSync(RULE_INDEX_PATH, "utf8");
  const parsed = JSON.parse(raw) as RuleIndex;
  cachedIndex = parsed;
  chunksById = new Map(parsed.chunks.map((chunk) => [chunk.id, chunk]));
  return parsed;
}

function index(): Map<string, RuleChunk> {
  if (!chunksById) loadRuleIndex();
  return chunksById as Map<string, RuleChunk>;
}

/** Look up a chunk by id. Throws on an unknown id — a citation typo must fail loudly. */
export function getChunk(id: string): RuleChunk {
  const chunk = index().get(id);
  if (!chunk) {
    throw new Error(
      `Unknown KB chunk id "${id}" — not present in data/kb/rules-index.json. ` +
        `The rule importer preserves matched identities and retires removed chunks. ` +
        `Review the source and this citation's obligation before choosing a replacement. ` +
        `Run \`node tools/kb/query.mjs rules "<topic>"\` to inspect candidate rules; ` +
        `do not replace IDs or reviewed fingerprints without checking their content.`,
    );
  }
  return chunk;
}

interface Citation {
  id: string;
  note?: string;
  file?: string;
  fingerprint?: string;
}

const citedIds = new Set<string>();
const citations: Citation[] = [];
const citedByFile = new Map<string, Set<string>>();

const notTestableIds = new Map<string, string>();
const notTestableByFile = new Map<string, Set<string>>();

/**
 * Best-effort resolution of "which file called into `_kb.ts`", via the call stack.
 * Used only to prove — conservatively — which chapter test files actually ran in
 * this process (see `assertAllChapterFilesObserved` and the README's "vacuous cite
 * set" section). Skips frames belonging to this module itself and to Node
 * internals; returns the first external frame, which is normally the test file
 * (or a thin test helper it called through).
 */
function callerFile(): string | undefined {
  const stack = new Error().stack?.split("\n").slice(1) ?? [];
  for (const line of stack) {
    const match = line.match(/\(?((?:file:\/\/\/|[A-Za-z]:[\\/]|\/)[^()]+):\d+:\d+\)?\s*$/);
    const location = match?.[1];
    if (!location) continue;
    const file = location.startsWith("file:") ? fileURLToPath(location) : resolve(location);
    if (file === SELF_FILE) continue;
    if (file.startsWith("node:")) continue;
    return file;
  }
  return undefined;
}

/**
 * Cite a KB chunk as the behavioral source for a test assertion. Returns the chunk
 * (so the caller can assert against `.text`) and records the id as covered.
 */
export function ruleFingerprint(chunk: RuleChunk): string {
  return createHash("sha256").update(chunk.text, "utf8").digest("hex");
}

export function cite(id: string, note?: string, expectedFingerprint?: string): RuleChunk {
  const chunk = getChunk(id);
  if (expectedFingerprint !== undefined && ruleFingerprint(chunk) !== expectedFingerprint) {
    throw new Error(
      `KB citation drift for "${id}": reviewed content changed; review the source before updating its fingerprint.`,
    );
  }
  const file = callerFile();
  citedIds.add(id);
  citations.push({ id, note, file, fingerprint: expectedFingerprint });
  if (file) {
    const set = citedByFile.get(file) ?? new Set<string>();
    set.add(id);
    citedByFile.set(file, set);
  }
  return chunk;
}

/**
 * Record a chunk as deliberately excluded from behavioral test coverage — because
 * it carries no normative content (a title page, table-of-contents entry, or bare
 * heading), not because it's merely hard to test. `reason` is required and, per
 * `NonEmptyString`, cannot be the empty string at compile time.
 */
export function markNotTestable<Reason extends string>(id: string, reason: NonEmptyString<Reason>): void {
  getChunk(id); // throws on an unknown id, same as cite()
  notTestableIds.set(id, reason);
  const file = callerFile();
  if (file) {
    const set = notTestableByFile.get(file) ?? new Set<string>();
    set.add(id);
    notTestableByFile.set(file, set);
  }
}

/** Every chunk id cited so far in this process, sorted. */
export function getCitedIds(): string[] {
  return Array.from(citedIds).sort();
}

/** Every chunk id marked not-testable so far in this process, sorted. */
export function getNotTestableIds(): string[] {
  return Array.from(notTestableIds.keys()).sort();
}

/** All recorded citations (id + optional note), in call order. For diagnostics. */
export function getCitations(): readonly Citation[] {
  return citations;
}

/** The reason a chunk was marked not-testable, or `undefined` if it wasn't. */
export function getNotTestableReason(id: string): string | undefined {
  return notTestableIds.get(id);
}

/**
 * Type-level guard making an empty not-testable reason a compile error: passing
 * `""` infers `T = ""`, so `NonEmptyString<T>` resolves to `never`, and `""` is not
 * assignable to `never`.
 */
export type NonEmptyString<T extends string> = T extends "" ? never : T;

/**
 * Files (by absolute path) observed to have called `cite()` or `markNotTestable()`
 * in this process. Used by the meta-test's collection guard — see README "the
 * vacuous-cite-set hazard".
 */
export function getObservedFiles(): string[] {
  const files = new Set<string>([...citedByFile.keys(), ...notTestableByFile.keys()]);
  return Array.from(files).sort();
}
