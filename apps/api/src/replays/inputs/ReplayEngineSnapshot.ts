import type { GameEngineSnapshot } from "#api/engine/snapshot/GameEngineSnapshot";

export type ReplayEngineSnapshot = {
  engine: GameEngineSnapshot;
  inputIndex: number;
  engineEvents: number;
  batchSequence: number;
  eventSequence: number;
  started: boolean;
};
