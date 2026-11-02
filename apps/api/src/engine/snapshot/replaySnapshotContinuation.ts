import type { GameEngine } from "#api/engine/GameEngine";
import type { SnapshotContinuation } from "#api/engine/snapshot/SnapshotContinuation";
import { applySnapshotContinuationInput } from "#api/engine/snapshot/applySnapshotContinuationInput";
import { waitForEngineIdle } from "#api/engine/snapshot/waitForEngineIdle";

type Params = {
  engine: GameEngine;
  continuation: SnapshotContinuation;
  progress: () => number;
  events: () => number;
};

export async function replaySnapshotContinuation({ engine, continuation, progress, events }: Params): Promise<void> {
  for (const [index, input] of continuation.inputs.entries()) {
    await waitForEngineIdle({ progress });
    if (events() !== input.events) {
      throw new Error(`Snapshot continuation diverged before input ${index}`);
    }
    try {
      applySnapshotContinuationInput({ engine, input });
    } catch {
      continue;
    }
  }
  await waitForEngineIdle({ progress });
  if (events() !== continuation.events) {
    throw new Error("Snapshot continuation diverged after its last input");
  }
}
