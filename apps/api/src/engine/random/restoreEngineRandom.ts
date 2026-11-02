import type { GameEngine } from "#api/engine/GameEngine";
import type { RandomSnapshot } from "#api/engine/random/RandomSnapshot";
import { SeededRandom } from "#api/engine/random/SeededRandom";

type Params = { engine: GameEngine; snapshots: readonly [RandomSnapshot, RandomSnapshot] };

export function restoreEngineRandom({ engine, snapshots }: Params): void {
  const streams = [
    SeededRandom.restore({ snapshot: snapshots[0], randomKey: engine.hooks.randomKey }),
    SeededRandom.restore({ snapshot: snapshots[1], randomKey: engine.hooks.randomKey }),
  ] as const;
  engine.randomStreams = streams;
  engine.rngForSeat = (seat) => () => streams[seat].next();
}
