import type { GameEngine } from "#api/engine/GameEngine";
import type { GameEngineSnapshot } from "#api/engine/snapshot/GameEngineSnapshot";
import { snapshotSettledGameEngine } from "#api/engine/snapshot/snapshotSettledGameEngine";

type Params = { engine: GameEngine; allowContinuation?: boolean };

export function snapshotGameEngine({ engine, allowContinuation = false }: Params): GameEngineSnapshot {
  try {
    return snapshotSettledGameEngine({ engine });
  } catch (error) {
    const continuation = allowContinuation ? engine.snapshotContinuation.getContinuationSnapshot() : undefined;
    if (continuation === undefined || !engine.runtimeObjects.snapshotsEnabled) {
      throw error;
    }
    return continuation;
  }
}
