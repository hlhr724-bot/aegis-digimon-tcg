import type { GameState } from "@aegis/shared/schema/GameState";

export type SearchRollout = {
  action: number;
  sample: number;
  reward: number;
  valid: boolean;
  reason: string;
  state: GameState;
  phasesMs: { restore: number; determinize: number; continuation: number; leaf: number };
};
