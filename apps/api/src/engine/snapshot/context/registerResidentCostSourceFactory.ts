import type { GameEngine } from "#api/engine/GameEngine";
import { buildResidentCostSourceActive } from "#api/engine/gameEngine/timing/buildResidentCostSourceActive";
import type { ResidentCostSourcePayload } from "#api/engine/gameEngine/timing/ResidentCostSourcePayload";
import { EngineRuntimeCallbackKind } from "#api/engine/snapshot/context/EngineRuntimeCallbackKind";

type Params = { engine: GameEngine };

export function registerResidentCostSourceFactory({ engine }: Params): void {
  engine.runtimeCallbacks.registerFactory({
    key: EngineRuntimeCallbackKind.RESIDENT_COST_SOURCE_ACTIVE.value,
    create: (payload) => {
      if (!isPayload(payload)) {
        throw new Error("Invalid resident cost source payload");
      }
      return buildResidentCostSourceActive({ engine, payload });
    },
  });
}

function isPayload(value: unknown): value is ResidentCostSourcePayload {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const payload = value as ResidentCostSourcePayload;
  return (
    payload.effect !== null &&
    typeof payload.effect === "object" &&
    typeof payload.effect.canActivate === "function" &&
    payload.ctx !== null &&
    typeof payload.ctx === "object"
  );
}
