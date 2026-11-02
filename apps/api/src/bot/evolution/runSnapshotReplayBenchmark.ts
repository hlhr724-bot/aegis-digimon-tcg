import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { isDeepStrictEqual } from "node:util";
import type { SequencedServerEvent } from "@aegis/shared/protocol/events";
import { SEED_RESIDUAL } from "#api/bot/evolution/residualPolicy";
import { informationKey } from "#api/bot/evolution/mcts";
import { createSeenOpponentCardsTracker } from "#api/bot/evolution/createSeenOpponentCardsTracker";
import { hasUnsupportedReplayDeterminization } from "#api/bot/evolution/hasUnsupportedReplayDeterminization";
import { runReplayContinuation } from "#api/bot/evolution/runReplayContinuation";
import type { GameEngineSnapshot } from "#api/engine/snapshot/GameEngineSnapshot";
import type { ReplayPosition } from "#api/bot/evolution/replayPositions";
import type { ReplayRecord } from "#api/replays/inputs/types";
import type { SeenOpponentCards } from "#api/bot/evolution/SeenOpponentCards";
import { runReplay } from "#api/replays/inputs/run";
import { replayPositions } from "#api/bot/evolution/replayPositions";

type Params = { record: ReplayRecord; repetitions: number; rootLimit: number };

type ContinuationParams = {
  record: ReplayRecord;
  position: ReplayPosition;
  snapshot: GameEngineSnapshot;
  restored: boolean;
  sampleSeed: number;
  seenOpponentCards: SeenOpponentCards;
};

type ContinuationSample = {
  restored: boolean;
  repetition: number;
  durationMs: number;
  reward: number;
  reason: string;
  turn: number;
  failures: string[];
};

async function runContinuation({
  record,
  position,
  snapshot,
  restored,
  sampleSeed,
  seenOpponentCards,
}: ContinuationParams) {
  const started = performance.now();
  const result = await runReplayContinuation({
    ...(restored ? { engineSnapshot: snapshot } : { record, inputIndex: position.inputIndex }),
    ...(!restored ? { forceArchetypeDeterminization: true } : {}),
    ...(record.randomKey === undefined ? {} : { randomKey: record.randomKey }),
    seenOpponentCards,
    seat: position.seat,
    expectedInformation: informationKey(position.window),
    sampleSeed,
    program: SEED_RESIDUAL,
    opponentProgram: SEED_RESIDUAL,
    rootWindow: position.window,
    choose: () => 0,
    chooseAfterRoot: () => 0,
    rolloutTurns: 2,
    maxRolloutDecisions: 64,
    turnLimit: 60,
  });
  return { result, durationMs: performance.now() - started };
}

export async function runSnapshotReplayBenchmark({ record, repetitions, rootLimit }: Params) {
  if (!Number.isSafeInteger(repetitions) || repetitions < 1 || repetitions > 100) {
    throw new Error("Snapshot benchmark repetitions must be from 1 to 100");
  }
  if (!Number.isSafeInteger(rootLimit) || rootLimit < 1) {
    throw new Error("Snapshot benchmark root limit must be a positive safe integer");
  }
  const positions = await replayPositions(record);
  if (positions.firstDivergence !== null) {
    throw new Error("Snapshot benchmark replay prefix diverged");
  }
  const expectedEvents: SequencedServerEvent[] = [];
  const expected = await runReplay(record, {
    stopOnDivergence: true,
    onBatch: (_state, events) => {
      expectedEvents.push(...structuredClone(events));
    },
  });
  if (expected.divergences.length > 0) {
    throw new Error("Snapshot benchmark complete replay diverged");
  }
  const roots = [];
  const rootCount = Math.min(rootLimit, positions.positions.length);
  const selectedPositions: ReplayPosition[] = [];
  const selectedIndices = new Set<number>();
  for (let rootIndex = 0; rootIndex < rootCount; rootIndex++) {
    const startIndex = Math.floor((rootIndex * positions.positions.length) / rootCount);
    for (let offset = 0; offset < positions.positions.length; offset++) {
      const positionIndex = (startIndex + offset) % positions.positions.length;
      if (selectedIndices.has(positionIndex)) continue;
      const position = positions.positions[positionIndex]!;
      let hasUnsupportedKnowledge = false;
      const prefix = await runReplay(record, {
        untilInput: position.inputIndex,
        stopOnDivergence: true,
        onBatch: (_state, events) => {
          if (events.some(hasUnsupportedReplayDeterminization)) hasUnsupportedKnowledge = true;
        },
      });
      if (prefix.divergences.length > 0) {
        throw new Error("Snapshot benchmark root replay diverged");
      }
      if (!hasUnsupportedKnowledge) {
        selectedIndices.add(positionIndex);
        selectedPositions.push(position);
        break;
      }
      selectedIndices.add(positionIndex);
    }
  }
  if (selectedPositions.length !== rootCount) {
    throw new Error("Snapshot benchmark requires enough roots without revealed or ordered hidden knowledge");
  }
  const simulationRoots = [];
  for (const position of selectedPositions) {
    const seenOpponentCards = createSeenOpponentCardsTracker({ observer: position.seat });
    const prefix = await runReplay(record, {
      untilInput: position.inputIndex,
      stopOnDivergence: true,
      onBatch: (_state, events) => {
        for (const event of events) seenOpponentCards.observeEvent(event);
      },
    });
    if (prefix.divergences.length > 0) {
      throw new Error("Snapshot benchmark root replay diverged");
    }
    const captureStart = performance.now();
    const snapshot = JSON.parse(JSON.stringify(prefix.getSnapshot()));
    const captureMs = performance.now() - captureStart;
    const simulationSamples: ContinuationSample[] = [];
    const sampleSeed = (record.seed + position.inputIndex * 104729) >>> 0;
    for (let repetition = 0; repetition < repetitions; repetition++) {
      const paths = repetition % 2 === 0 ? [false, true] : [true, false];
      const outcomes: ContinuationSample[] = [];
      for (const restored of paths) {
        const measured = await runContinuation({
          record,
          position,
          snapshot: snapshot.engine,
          restored,
          sampleSeed,
          seenOpponentCards: seenOpponentCards.snapshot(),
        });
        if (!measured.result.valid || measured.result.reason !== "rolloutCutoff") {
          throw new Error(`Snapshot simulation benchmark produced an invalid rollout at input ${position.inputIndex}`);
        }
        outcomes.push({
          restored,
          repetition,
          durationMs: measured.durationMs,
          reward: measured.result.reward,
          reason: measured.result.reason,
          turn: measured.result.turn,
          failures: measured.result.failures,
        });
      }
      const replayed = outcomes.find((sample) => !sample.restored)!;
      const restored = outcomes.find((sample) => sample.restored)!;
      if (
        replayed.reward !== restored.reward ||
        replayed.reason !== restored.reason ||
        replayed.turn !== restored.turn ||
        !isDeepStrictEqual(replayed.failures, restored.failures)
      ) {
        throw new Error(`Snapshot simulation benchmark rollout differs at input ${position.inputIndex}`);
      }
      simulationSamples.push(...outcomes);
    }
    const replaySimulationMs = simulationSamples
      .filter((sample) => !sample.restored)
      .reduce((sum, sample) => sum + sample.durationMs, 0);
    const snapshotSimulationMs = simulationSamples
      .filter((sample) => sample.restored)
      .reduce((sum, sample) => sum + sample.durationMs, 0);
    simulationRoots.push({
      inputIndex: position.inputIndex,
      sampleSeed,
      replaySimulationMs,
      snapshotSimulationMs,
      speedup: replaySimulationMs / snapshotSimulationMs,
      samples: simulationSamples,
    });
    const actualEvents: SequencedServerEvent[] = [];
    const actual = await runReplay(record, {
      snapshot,
      stopOnDivergence: true,
      onBatch: (_state, events) => {
        actualEvents.push(...structuredClone(events));
      },
    });
    if (
      actual.divergences.length > 0 ||
      actual.applied !== expected.applied ||
      actual.engineEvents !== expected.engineEvents ||
      !isDeepStrictEqual(actual.state.toJSON(), expected.state.toJSON()) ||
      !isDeepStrictEqual(
        actualEvents,
        expectedEvents.filter((event) => event.seq > snapshot.eventSequence),
      )
    ) {
      throw new Error(`Snapshot benchmark continuation differs at input ${position.inputIndex}`);
    }
    const samples = [];
    for (let repetition = -1; repetition < repetitions; repetition++) {
      for (const restored of repetition % 2 === 0 ? [false, true] : [true, false]) {
        const start = performance.now();
        const result = await runReplay(record, {
          untilInput: position.inputIndex,
          stopOnDivergence: true,
          ...(restored ? { snapshot } : {}),
        });
        const durationMs = performance.now() - start;
        if (result.divergences.length > 0 || !isDeepStrictEqual(result.state.toJSON(), prefix.state.toJSON())) {
          throw new Error("Snapshot benchmark timed root differs");
        }
        if (repetition >= 0) {
          samples.push({ restored, repetition, durationMs });
        }
      }
    }
    const replayMs = samples.filter((sample) => !sample.restored).reduce((sum, sample) => sum + sample.durationMs, 0);
    const restoreMs = samples.filter((sample) => sample.restored).reduce((sum, sample) => sum + sample.durationMs, 0);
    roots.push({
      engineFingerprint: snapshot.engine.fingerprint,
      inputIndex: position.inputIndex,
      captureMs,
      replayMs,
      restoreMs,
      speedup: replayMs / restoreMs,
      samples,
    });
  }
  if (roots.length === 0) {
    throw new Error("Snapshot benchmark requires at least one Main root");
  }
  const replayMs = roots.reduce((sum, root) => sum + root.replayMs, 0);
  const restoreMs = roots.reduce((sum, root) => sum + root.restoreMs, 0);
  const replaySimulationMs = simulationRoots.reduce((sum, root) => sum + root.replaySimulationMs, 0);
  const snapshotSimulationMs = simulationRoots.reduce((sum, root) => sum + root.snapshotSimulationMs, 0);
  const simulationSpeedup = replaySimulationMs / snapshotSimulationMs;
  const restorationSpeedup = replayMs / restoreMs;
  return {
    schemaVersion: 1,
    mode: "snapshot-restoration-and-rollout",
    nodeVersion: process.version,
    replaySha256: createHash("sha256").update(JSON.stringify(record)).digest("hex"),
    seed: record.seed,
    matchId: record.matchId,
    equivalent: true,
    repetitions,
    speedup: restorationSpeedup,
    targetSpeedup: 10,
    restorationTargetMet: restorationSpeedup >= 10,
    simulationSpeedup,
    simulationEquivalent: true,
    simulationTargetMet: simulationSpeedup >= 10,
    targetMet: simulationSpeedup >= 10,
    roots,
    simulationRoots,
  };
}
