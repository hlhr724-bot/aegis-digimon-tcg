import type { RuntimeCallback } from "#api/engine/snapshot/RuntimeCallback";
import { createPermanentFilterMatch } from "#api/engine/effects/interpreter/matching/createPermanentFilterMatch";
import type { PermanentFilterMatchParams } from "#api/engine/effects/interpreter/matching/PermanentFilterMatchParams";

export function createPermanentFilterMatchCallback(payload: unknown): RuntimeCallback {
  const params = payload as PermanentFilterMatchParams | null;
  if (
    params === null ||
    typeof params !== "object" ||
    params.ctx === null ||
    typeof params.ctx !== "object" ||
    (params.filter !== undefined && (params.filter === null || typeof params.filter !== "object")) ||
    (params.sourceKinds !== undefined && !Array.isArray(params.sourceKinds))
  ) {
    throw new Error("Invalid permanent filter match payload");
  }
  return createPermanentFilterMatch(params);
}
