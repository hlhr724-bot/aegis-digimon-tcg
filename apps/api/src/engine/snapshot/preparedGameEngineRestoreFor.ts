import type { GameEngineSnapshot } from "#api/engine/snapshot/GameEngineSnapshot";
import type { PreparedGameEngineRestore } from "#api/engine/snapshot/PreparedGameEngineRestore";
import { prepareGameEngineRestore } from "#api/engine/snapshot/prepareGameEngineRestore";

const preparedRestores = new WeakMap<GameEngineSnapshot, PreparedGameEngineRestore | null>();

export function preparedGameEngineRestoreFor(snapshot: GameEngineSnapshot): PreparedGameEngineRestore | undefined {
  let prepared = preparedRestores.get(snapshot);
  if (prepared === undefined) {
    prepared = prepareGameEngineRestore({ snapshot }) ?? null;
    preparedRestores.set(snapshot, prepared);
  }
  return prepared ?? undefined;
}
