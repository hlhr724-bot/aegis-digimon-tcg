import type { RuntimeCallback } from "#api/engine/snapshot/RuntimeCallback";
import { CostModifierCallbackField } from "#api/engine/effects/interpreter/costModifiers/CostModifierCallbackField";
import type { CostModifierMatchParams } from "#api/engine/effects/interpreter/costModifiers/CostModifierMatchParams";
import { createEvoCostMatch } from "#api/engine/effects/interpreter/costModifiers/createEvoCostMatch";
import { createPlayCostDefinitionMatch } from "#api/engine/effects/interpreter/costModifiers/createPlayCostDefinitionMatch";
import { createSuspendTamerConsume } from "#api/engine/effects/interpreter/costModifiers/createSuspendTamerConsume";

type Payload = { params: CostModifierMatchParams; field: CostModifierCallbackField };

const CREATORS = {
  [CostModifierCallbackField.EVO_COST_MATCH.value]: createEvoCostMatch,
  [CostModifierCallbackField.PLAY_COST_MATCH.value]: createPlayCostDefinitionMatch,
  [CostModifierCallbackField.SUSPEND_TAMER_CONSUME.value]: createSuspendTamerConsume,
} as const satisfies Record<CostModifierCallbackField, (params: CostModifierMatchParams) => RuntimeCallback>;

export function createCostModifierCallback(payload: unknown): RuntimeCallback {
  if (payload === null || typeof payload !== "object") {
    throw new Error("Invalid cost modifier callback payload");
  }
  const { params, field } = payload as Payload;
  if (
    params === null ||
    typeof params !== "object" ||
    params.ctx === null ||
    typeof params.ctx !== "object" ||
    params.action?.kind !== "CostModifier" ||
    params.filter === null ||
    typeof params.filter !== "object" ||
    typeof params.selfRef !== "boolean" ||
    typeof params.setMode !== "boolean" ||
    !Array.isArray(params.seats) ||
    !Object.hasOwn(CREATORS, field)
  ) {
    throw new Error("Invalid cost modifier callback payload");
  }
  return CREATORS[field](params);
}
