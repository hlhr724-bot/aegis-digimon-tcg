import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { deserialize } from "node:v8";
import type { BotSearchTask } from "#api/bot/search/BotSearchTask";
import type { CapturedSearchRootDigest } from "#api/bot/search/CapturedSearchRootDigest";
import { runBotSearchTask } from "#api/bot/search/runBotSearchTask";
import type { SearchRollout } from "#api/bot/search/SearchRollout";
import { getEngineCodeFingerprint } from "#api/engine/snapshot/getEngineCodeFingerprint";

type Params = {
  taskDirectory: string;
  simulations: number;
  candidateLimit: number;
  repetitions: number;
  referenceDigests?: readonly CapturedSearchRootDigest[];
};

type Phases = SearchRollout["phasesMs"];

function sumPhases(rollouts: readonly SearchRollout[]): Phases {
  const total: Phases = { restore: 0, determinize: 0, continuation: 0, leaf: 0 };
  for (const rollout of rollouts) {
    total.restore += rollout.phasesMs.restore;
    total.determinize += rollout.phasesMs.determinize;
    total.continuation += rollout.phasesMs.continuation;
    total.leaf += rollout.phasesMs.leaf;
  }
  return total;
}

function digestState(rollout: SearchRollout): string {
  return createHash("sha256").update(JSON.stringify(rollout.state.toJSON())).digest("hex");
}

function getMedian(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle]!;
  }
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function loadTasks(taskDirectory: string): { file: string; task: BotSearchTask }[] {
  const fingerprint = getEngineCodeFingerprint();
  return readdirSync(taskDirectory)
    .filter((file) => file.endsWith(".bin"))
    .sort()
    .map((file) => {
      const task = deserialize(readFileSync(join(taskDirectory, file))) as BotSearchTask;
      return { file, task: { ...task, snapshot: { ...task.snapshot, fingerprint } } };
    });
}

export async function runCapturedSearchRootsBenchmark({
  taskDirectory,
  simulations,
  candidateLimit,
  repetitions,
  referenceDigests,
}: Params) {
  if (!Number.isSafeInteger(repetitions) || repetitions < 1 || repetitions > 100) {
    throw new Error("Captured search benchmark repetitions must be from 1 to 100");
  }
  const tasks = loadTasks(taskDirectory);
  if (tasks.length === 0) {
    throw new Error("Captured search benchmark found no .bin search tasks");
  }
  const repetitionSamples = [];
  let digests: CapturedSearchRootDigest[] | undefined;
  for (let repetition = 0; repetition < repetitions; repetition++) {
    const rollouts: SearchRollout[] = [];
    const repetitionDigests: CapturedSearchRootDigest[] = [];
    let durationMs = 0;
    const cpuStart = process.cpuUsage();
    for (const { file, task } of tasks) {
      const rootRollouts: SearchRollout[] = [];
      const transferred = JSON.parse(JSON.stringify(task)) as BotSearchTask;
      const started = performance.now();
      const result = await runBotSearchTask({
        task: {
          ...transferred,
          simulations,
          candidateLimit,
          deadlineEpochMs: Date.now() + 600_000,
        },
        signal: new AbortController().signal,
        onRollout: (rollout) => rootRollouts.push(rollout),
      });
      durationMs += performance.now() - started;
      rollouts.push(...rootRollouts);
      const { timeBudget: _timeBudget, ...report } = result.report;
      repetitionDigests.push({
        file,
        action: result.action,
        report,
        rollouts: rootRollouts.map((rollout) => ({
          action: rollout.action,
          sample: rollout.sample,
          reward: rollout.reward,
          valid: rollout.valid,
          reason: rollout.reason,
          state: digestState(rollout),
        })),
      });
    }
    const cpu = process.cpuUsage(cpuStart);
    if (digests === undefined) {
      digests = repetitionDigests;
    } else if (JSON.stringify(digests) !== JSON.stringify(repetitionDigests)) {
      throw new Error(`Captured search repetition ${repetition} differs from the first repetition`);
    }
    const phases = sumPhases(rollouts);
    repetitionSamples.push({
      repetition,
      rollouts: rollouts.length,
      msPerRollout: durationMs / rollouts.length,
      cpuMsPerRollout: (cpu.user + cpu.system) / 1000 / rollouts.length,
      phasesMsPerRollout: {
        restore: phases.restore / rollouts.length,
        determinize: phases.determinize / rollouts.length,
        continuation: phases.continuation / rollouts.length,
        leaf: phases.leaf / rollouts.length,
      },
    });
  }
  const differingRoots =
    referenceDigests === undefined
      ? undefined
      : digests!
          .filter((digest, index) => JSON.stringify(digest) !== JSON.stringify(referenceDigests[index] ?? null))
          .map((digest) => digest.file);
  return {
    schemaVersion: 1,
    mode: "captured-search-roots",
    nodeVersion: process.version,
    roots: tasks.length,
    simulations,
    candidateLimit,
    repetitions,
    rolloutsPerRepetition: repetitionSamples[0]!.rollouts,
    medianMsPerRollout: getMedian(repetitionSamples.map((sample) => sample.msPerRollout)),
    medianCpuMsPerRollout: getMedian(repetitionSamples.map((sample) => sample.cpuMsPerRollout)),
    medianPhasesMsPerRollout: {
      restore: getMedian(repetitionSamples.map((sample) => sample.phasesMsPerRollout.restore)),
      determinize: getMedian(repetitionSamples.map((sample) => sample.phasesMsPerRollout.determinize)),
      continuation: getMedian(repetitionSamples.map((sample) => sample.phasesMsPerRollout.continuation)),
      leaf: getMedian(repetitionSamples.map((sample) => sample.phasesMsPerRollout.leaf)),
    },
    ...(differingRoots === undefined
      ? {}
      : {
          equivalentToReference: differingRoots.length === 0 && referenceDigests!.length === digests!.length,
          differingRoots,
        }),
    samples: repetitionSamples,
    digests,
  };
}
