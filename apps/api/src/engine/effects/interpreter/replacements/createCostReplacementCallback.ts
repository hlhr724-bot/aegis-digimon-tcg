import type { RuntimeCallback } from "#api/engine/snapshot/RuntimeCallback";
import type { CostReplacementInstallParams } from "#api/engine/effects/interpreter/replacements/CostReplacementInstallParams";
import { CostReplacementCallbackField } from "#api/engine/effects/interpreter/replacements/CostReplacementCallbackField";
import { createCostReplacementInstall } from "#api/engine/effects/interpreter/replacements/createCostReplacementInstall";

type Payload = { params: CostReplacementInstallParams; field: CostReplacementCallbackField };

export function createCostReplacementCallback(payload: unknown): RuntimeCallback {
  if (payload === null || typeof payload !== "object") {
    throw new Error("Invalid cost replacement callback payload");
  }
  const { params, field } = payload as Payload;
  if (
    params === null ||
    typeof params !== "object" ||
    params.ctx === null ||
    typeof params.ctx !== "object" ||
    params.action?.kind !== "Replacement" ||
    (params.mode !== "reduceCost" && params.mode !== "increaseCost") ||
    !Array.isArray(params.interactiveCosts) ||
    !Array.isArray(params.interactiveAdditionalCosts) ||
    (params.ownerSeat !== 0 && params.ownerSeat !== 1) ||
    typeof params.interactiveOptional !== "boolean" ||
    typeof params.scalesIntoColors !== "boolean" ||
    !Object.values(CostReplacementCallbackField).some((entry) => entry.value === field)
  ) {
    throw new Error("Invalid cost replacement callback payload");
  }
  const callback = createCostReplacementInstall(params)[field];
  if (typeof callback !== "function") {
    throw new Error("Cost replacement callback is absent from its installation");
  }
  return callback;
}
