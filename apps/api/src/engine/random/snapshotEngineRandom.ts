import type { GameEngine } from "#api/engine/GameEngine";
import type { RandomSnapshot } from "#api/engine/random/RandomSnapshot";

type Params = { engine: GameEngine };

export function snapshotEngineRandom({ engine }: Params): readonly [RandomSnapshot, RandomSnapshot] {
  if (engine.randomStreams === undefined) {
    throw new Error("Engine random streams are not initialized");
  }
  return [engine.randomStreams[0].snapshot(), engine.randomStreams[1].snapshot()];
}
