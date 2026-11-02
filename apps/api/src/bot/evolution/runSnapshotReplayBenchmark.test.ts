import { expect, it } from "vitest";
import { extractReplay } from "#api/replays/inputs/extract";
import { recordRoomMatch } from "#api/replays/inputs/roomMatch.fixture";
import { runSnapshotReplayBenchmark } from "#api/bot/evolution/runSnapshotReplayBenchmark";

it("measures snapshot restoration and rollout speed only after proving their continuations equivalent", async () => {
  const recorded = await recordRoomMatch({ seed: 20260914 });
  const record = extractReplay(recorded.lines, recorded.matchId);
  const report = await runSnapshotReplayBenchmark({ record, repetitions: 1, rootLimit: 2 });
  expect(report.equivalent).toBe(true);
  expect(report.roots).toHaveLength(2);
  expect(report.roots[1]!.inputIndex).toBeGreaterThan(report.roots[0]!.inputIndex);
  expect(report.roots.every((root) => root.samples.length === 2)).toBe(true);
  expect(report.simulationRoots).toHaveLength(2);
  expect(Math.max(...report.simulationRoots.map((root) => root.inputIndex))).toBeGreaterThan(6);
  expect(report.simulationEquivalent).toBe(true);
  expect(report.simulationRoots.every((root) => root.samples.length === 2)).toBe(true);
  expect(report.speedup).toBeGreaterThan(0);
  expect(report.simulationSpeedup).toBeGreaterThan(0);
  expect(report.restorationTargetMet).toBe(report.speedup >= report.targetSpeedup);
  expect(report.simulationTargetMet).toBe(report.simulationSpeedup >= report.targetSpeedup);
  expect(report.targetMet).toBe(report.simulationSpeedup >= report.targetSpeedup);
  await expect(runSnapshotReplayBenchmark({ record, repetitions: 0, rootLimit: 2 })).rejects.toThrow("repetitions");
  await expect(runSnapshotReplayBenchmark({ record, repetitions: 1, rootLimit: 0 })).rejects.toThrow("root limit");
}, 60000);
