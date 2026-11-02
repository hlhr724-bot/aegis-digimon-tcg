import type { RuntimeCallback } from "#api/engine/snapshot/RuntimeCallback";
import { createTamerAsDigimonMatch } from "#api/engine/effects/interpreter/matching/createTamerAsDigimonMatch";
import type { TamerAsDigimonMatchParams } from "#api/engine/effects/interpreter/matching/TamerAsDigimonMatchParams";

export function createTamerAsDigimonMatchCallback(payload: unknown): RuntimeCallback {
  const params = payload as TamerAsDigimonMatchParams | null;
  if (
    params === null ||
    typeof params !== "object" ||
    params.ctx === null ||
    typeof params.ctx !== "object" ||
    params.filter === null ||
    typeof params.filter !== "object" ||
    !Array.isArray(params.sourceKinds) ||
    (params.present !== undefined && !(params.present instanceof Set))
  ) {
    throw new Error("Invalid Tamer-as-Digimon match payload");
  }
  return createTamerAsDigimonMatch(params);
}
