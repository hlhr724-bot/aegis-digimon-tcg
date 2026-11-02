import type { GameEngine } from "#api/engine/GameEngine";
import { canActivate, canTrigger } from "#api/engine/effects/kernel";
import type { ResidentCostSourcePayload } from "#api/engine/gameEngine/timing/ResidentCostSourcePayload";

type Params = { engine: GameEngine; payload: ResidentCostSourcePayload };

export function buildResidentCostSourceActive({ engine, payload: { effect, ctx } }: Params): () => boolean {
  return () => canTrigger(effect, ctx, engine.tracker) && canActivate(effect, ctx, engine.tracker);
}
