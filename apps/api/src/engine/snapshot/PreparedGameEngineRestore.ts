import type { GameState } from "@aegis/shared/schema/GameState";
import type { GameEngineSnapshot } from "#api/engine/snapshot/GameEngineSnapshot";

export type PreparedGameEngineRestore = {
  snapshot: GameEngineSnapshot;
  state: GameState;
  schemaSeeds: readonly (readonly [number, object])[];
};
