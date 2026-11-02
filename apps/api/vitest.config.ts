import { globSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { availableParallelism } from "node:os";
import { defineConfig, configDefaults } from "vitest/config";
import { testExecArgv, testMaxWorkers } from "./vitest.workers.js";
import { writeCardTestBatches } from "./test-support/card-test-batches.mjs";

// Heavy suites: slow engine-compute, the fuzzer's 2000 random
// iterations, and the per-card files. Excluded from the `test:fast` inner loop
// (set FAST=1) so day-to-day runs stay quick; the full `pnpm test` still runs them.
const heavySuites = [
  "src/engine/mechanic.test.ts",
  "src/engine/effectFiring.test.ts",
  "src/engine/fuzzer.test.ts",
  "src/cards/**",
  "src/engine/conformance/**",
];

// The transaction lane needs a real Postgres, so it is its own opt-in lane (`pnpm test:postgres`,
// or POSTGRES_TESTS=1 with POSTGRES_TEST_URL). It is excluded rather than skipped: a suite that
// cannot run here is not a pending test, and reporting it as one buries a real skip in the noise.
const postgresLane = "src/db/postgres.atomicity*.test.ts";

const testFiles = "src/**/*.test.ts";
// pnpm test may forward a focused path to Vitest; in that case keep the original
// file selectable rather than excluding it in favor of its generated batch.
const focusedPath = process.argv.some((arg) => arg.startsWith("src/") || arg.startsWith("test-support/"));
const batchCards = process.env.TEST_BATCH_CARDS === "1" && !process.env.FAST && !focusedPath;
const exclude = [
  ...configDefaults.exclude,
  ...(process.env.FAST ? heavySuites : []),
  ...(process.env.POSTGRES_TESTS === "1" ? [] : [postgresLane]),
];

// Module mocking and in-source tests need Vite's module runner; every other file runs on Node's
// loader with a per-file Oxc transform (test-support/ts-loader.mjs), which halves load time.
const { viteRunnerFiles, batchCandidates } = scanTestFiles();
const batchedCardFiles = batchCards ? writeCardTestBatches(batchCandidates) : [];

/**
 * Scanning every test file costs ~0.1s warm and ~1s cold, so the verdict per file is cached
 * under node_modules/.cache and re-read only when the file's mtime or size changes.
 */
function scanTestFiles(): { viteRunnerFiles: string[]; batchCandidates: string[] } {
  const cachePath = "node_modules/.cache/vite-runner-files.json";
  const needsViteRunner = /\bvi\.(mock|doMock|unmock|hoisted)\(|import\.meta\.vitest/;
  // Hooks and runner state must retain their original file boundary. Ordinary
  // card suites already share a module graph (isolate:false) and can be grouped.
  const unsafeToBatch =
    /\b(?:beforeEach|afterEach|beforeAll|afterAll)\s*\(|\bvi\.|\b(?:it|test|describe)\.concurrent\s*\(|process\.env|globalThis\./;
  type Entry = [mtimeMs: number, size: number, needsViteRunner: boolean, batchSafe?: boolean];
  let cache: Record<string, Entry> = {};
  try {
    cache = JSON.parse(readFileSync(cachePath, "utf8"));
  } catch {}
  const next: typeof cache = {};
  for (const file of globSync(testFiles)) {
    const { mtimeMs, size } = statSync(file);
    const cached = cache[file];
    if (cached && cached[0] === mtimeMs && cached[1] === size && (!batchCards || cached[3] !== undefined)) {
      next[file] = cached;
      continue;
    }
    const source = readFileSync(file, "utf8");
    next[file] = [mtimeMs, size, needsViteRunner.test(source), !unsafeToBatch.test(source)];
  }
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(next));
  const files = Object.keys(next);
  return {
    viteRunnerFiles: files.filter((file) => next[file]![2]),
    batchCandidates: files.filter((file) => file.startsWith("src/cards/") && next[file]![3] === true),
  };
}

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "native",
          include: [testFiles, ...(batchCards ? ["test-support/batches/*.test.ts"] : [])],
          exclude: [...exclude, ...viteRunnerFiles, ...batchedCardFiles],
          execArgv: ["--import=./test-support/ts-loader.mjs", ...testExecArgv(process.argv)],
          experimental: { viteModuleRunner: false, nodeLoader: false },
          globalSetup: ["./test-support/global-setup.mjs"],
        },
      },
      ...(viteRunnerFiles.length
        ? [{ extends: true, test: { name: "vite", include: viteRunnerFiles, exclude, isolate: true } }]
        : []),
    ],
    // `forks` (process isolation) gives each file a full heap. `threads` shares a
    // capped worker heap and the full card suite exhausts it (ERR_WORKER_OUT_OF_MEMORY),
    // GC-thrashing for ~80s before dying.
    pool: "forks",
    maxWorkers: testMaxWorkers(availableParallelism()),
    execArgv: testExecArgv(process.argv),
    isolate: false,
    // Transformed modules persist under node_modules so a rerun skips the transform pass
    // instead of repeating it (measured at 2-10x on a warm card-set run).
    fsModuleCache: true,
    testTimeout: 15_000,
    slowTestThreshold: 3_000,
  },
});
