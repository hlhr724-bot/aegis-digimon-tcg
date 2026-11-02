import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import type { Seat } from "@aegis/shared/schema/enums";

process.env.NODE_ENV = "test";
const writeReport = process.stdout.write.bind(process.stdout);
process.stdout.write = process.stderr.write.bind(process.stderr);
const { runEvolutionMatch } = await import("#api/bot/evolution/evolutionMatch");
const { SEED_HEURISTIC } = await import("#api/bot/evolution/heuristic");
const { randomDeck } = await import("#api/bot/evolution/randomDecks");
const { evolutionDeck } = await import("#api/bot/evolution/decks");
const { trainingMetadata } = await import("#api/bot/training/metadata");

async function main(): Promise<void> {
  const input = JSON.parse(readFileSync(0, "utf8")) as {
    simulations: number;
    compareHandAffordances?: boolean;
    seed?: number;
    learnerSeat?: Seat;
    repetitions?: number;
    mode?: "single-search-after-prefix" | "full-game" | "snapshot-restoration" | "captured-search-roots";
    taskDirectory?: string;
    candidateLimit?: number;
    referenceFile?: string;
    replayFile?: string;
    rootLimit?: number;
    startAfterDecisions?: number;
    decks?: [string | number, string | number];
    rolloutTurns?: number;
  };
  if (input.mode === "snapshot-restoration") {
    if (typeof input.replayFile !== "string") {
      throw new Error("Snapshot benchmark requires a replayFile");
    }
    const { runSnapshotReplayBenchmark } = await import("#api/bot/evolution/runSnapshotReplayBenchmark");
    const record = JSON.parse(readFileSync(input.replayFile, "utf8"));
    const report = await runSnapshotReplayBenchmark({
      record,
      repetitions: input.repetitions ?? 4,
      rootLimit: input.rootLimit ?? 8,
    });
    writeReport(JSON.stringify(report) + "\n");
    return;
  }
  if (input.mode === "captured-search-roots") {
    if (typeof input.taskDirectory !== "string") {
      throw new Error("Captured search benchmark requires a taskDirectory");
    }
    console.log = console.info = console.debug = console.warn = () => {};
    const { runCapturedSearchRootsBenchmark } = await import("#api/bot/search/runCapturedSearchRootsBenchmark");
    const report = await runCapturedSearchRootsBenchmark({
      taskDirectory: input.taskDirectory,
      simulations: input.simulations,
      candidateLimit: input.candidateLimit ?? 8,
      repetitions: input.repetitions ?? 10,
      ...(input.referenceFile === undefined
        ? {}
        : { referenceDigests: JSON.parse(readFileSync(input.referenceFile, "utf8")).digests }),
    });
    writeReport(JSON.stringify(report) + "\n");
    if (report.equivalentToReference === false) {
      process.exitCode = 1;
    }
    return;
  }
  const deckKeys = input.decks ?? [1, 2];
  if (!Array.isArray(deckKeys) || deckKeys.length !== 2)
    throw new Error("Benchmark requires exactly two deck identities");
  const resolveDeck = (key: string | number) => {
    if (typeof key === "string") return evolutionDeck(key);
    if (!Number.isSafeInteger(key) || key < 0 || key > 0xffffffff)
      throw new Error("Random benchmark deck seeds must be unsigned32-bit integers");
    const source = randomDeck(key);
    return {
      ...source,
      name: source.id,
      sha256: createHash("sha256").update(JSON.stringify(source.deck)).digest("hex"),
    };
  };
  const decks = [resolveDeck(deckKeys[0]!), resolveDeck(deckKeys[1]!)] as const;
  const engineSha256 = trainingMetadata().engineSha256;
  const repetitions = input.repetitions ?? 2;
  const mode = input.mode ?? "single-search-after-prefix";
  if (mode !== "single-search-after-prefix" && mode !== "full-game") throw new Error("Unknown benchmark mode");
  if (!Number.isSafeInteger(input.simulations) || input.simulations <= 0)
    throw new Error("Benchmark simulations must be a positive safe integer");
  const startAfterDecisions = input.startAfterDecisions ?? 16;
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 8)
    throw new Error("Benchmark repetitions must be from 1 to 8");
  if (input.learnerSeat !== undefined && input.learnerSeat !== 0 && input.learnerSeat !== 1)
    throw new Error("Benchmark learner seat must be zero or one");
  const run = async (enabled: boolean, simulations: number, repetition: number, phase: "warmup" | "measured") => {
    const bounded = phase === "warmup" || mode === "single-search-after-prefix";
    const cpuStart = process.cpuUsage();
    const start = performance.now();
    const result = await runEvolutionMatch({
      seed: input.seed ?? 42,
      learnerSeat: input.learnerSeat ?? 0,
      decks: [decks[0].deck, decks[1].deck],
      program: SEED_HEURISTIC,
      mcts: {
        simulations,
        seed: 619,
        reusePrefixActions: input.compareHandAffordances === true || enabled,
        omitRolloutHandAffordances: input.compareHandAffordances === true && enabled,
        ...(input.rolloutTurns === undefined ? {} : { rolloutTurns: input.rolloutTurns }),
        ...(bounded ? { startAfterDecisions, maxSearches: 1 } : {}),
      },
      turnLimit: 60,
      captureTraces: true,
      onSearch: (search) => {
        process.stderr.write(JSON.stringify({ phase, repetition, enabled, search }) + "\n");
      },
    });
    const durationMs = performance.now() - start;
    const cpu = process.cpuUsage(cpuStart);
    if (!result.valid || result.searches.length === 0)
      throw new Error("Benchmark requires a complete valid real-engine search match");
    if (bounded && result.searches.length !== 1)
      throw new Error("Bounded benchmark requires exactly one real-engine search");
    if (result.searches.some((search) => search.completed !== simulations || search.invalid !== 0))
      throw new Error("Benchmark requires the exact completed budget and zero invalid rollouts");
    if (enabled && result.restoration.reusedMainCatalogs === 0)
      throw new Error("Benchmark must exercise recorded main catalog reuse");
    const identity = createHash("sha256")
      .update(
        JSON.stringify({
          result: {
            ...result.result,
            seats: result.result.seats.map(({ decisionLatenciesMs: _decisionLatenciesMs, ...stats }) => stats),
          },
          searches: result.searches,
          traces: result.traces,
          decisions: result.decisions,
        }),
      )
      .digest("hex");
    const sample = {
      enabled,
      durationMs,
      cpuUserMs: cpu.user / 1000,
      cpuSystemMs: cpu.system / 1000,
      cpuDurationMs: (cpu.user + cpu.system) / 1000,
      identity,
      requestedRollouts: result.searches.reduce((total, search) => total + search.requested, 0),
      completedRollouts: result.searches.reduce((total, search) => total + search.completed, 0),
      invalidRollouts: result.searches.reduce((total, search) => total + search.invalid, 0),
      restoration: result.restoration,
    };
    process.stderr.write(JSON.stringify({ phase, repetition, ...sample }) + "\n");
    return sample;
  };
  const warmup: Awaited<ReturnType<typeof run>>[] = [];
  for (const enabled of [false, true]) warmup.push(await run(enabled, input.simulations, 0, "warmup"));
  if (warmup[0]!.identity !== warmup[1]!.identity)
    throw new Error("Prefix acceleration changed the warm-up seeded game, actions or search report");
  const samples: Awaited<ReturnType<typeof run>>[] = [];
  for (let repetition = 0; repetition < repetitions; repetition++) {
    for (const enabled of repetition % 2 === 0 ? [false, true] : [true, false]) {
      const sample = await run(enabled, input.simulations, repetition, "measured");
      if (samples.length > 0 && sample.identity !== samples[0]!.identity)
        throw new Error("Prefix acceleration changed the seeded game, actions or search report");
      samples.push(sample);
    }
  }
  const duration = (enabled: boolean): number =>
    samples.filter((sample) => sample.enabled === enabled).reduce((total, sample) => total + sample.durationMs, 0);
  const cpuDuration = (enabled: boolean): number =>
    samples.filter((sample) => sample.enabled === enabled).reduce((total, sample) => total + sample.cpuDurationMs, 0);
  if (trainingMetadata().engineSha256 !== engineSha256) throw new Error("Benchmark runtime changed during measurement");
  writeReport(
    JSON.stringify({
      schemaVersion: 3,
      engineSha256,
      nodeVersion: process.version,
      nodeEnvironment: process.env.NODE_ENV,
      compareHandAffordances: input.compareHandAffordances === true,
      acceleration:
        input.compareHandAffordances === true
          ? ["omit-rollout-hand-affordances"]
          : [
              "prefix-main-action-catalog",
              "guarded-action-index",
              "rejection-only-rollout-events",
              "disabled-rollout-latency-sampling",
              "public-indexed-score-only-rollout-chooser",
            ],
      simulations: input.simulations,
      mode,
      ...(mode === "single-search-after-prefix" ? { startAfterDecisions, maxSearches: 1 } : {}),
      seed: input.seed ?? 42,
      learnerSeat: input.learnerSeat ?? 0,
      decks: decks.map(({ id, name, sha256 }) => ({ id, name, sha256 })),
      repetitions,
      warmup: {
        mode: "single-search-after-prefix",
        startAfterDecisions,
        maxSearches: 1,
        simulations: input.simulations,
        excludedFromTiming: true,
        samples: warmup,
      },
      equivalent: true,
      speedup: duration(false) / duration(true),
      savedWallTimeFraction: 1 - duration(true) / duration(false),
      cpuSpeedup: cpuDuration(false) / cpuDuration(true),
      savedCpuTimeFraction: 1 - cpuDuration(true) / cpuDuration(false),
      samples,
    }) + "\n",
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(String(error) + "\n");
  process.exitCode = 1;
});
