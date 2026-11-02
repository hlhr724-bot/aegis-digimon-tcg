import type { RuntimeCallback } from "#api/engine/snapshot/RuntimeCallback";
import { createPermanentFilterMatchCallback } from "#api/engine/effects/interpreter/matching/createPermanentFilterMatchCallback";

export function createGrantActivityCallback(payload: unknown): RuntimeCallback {
  const permanentId = (payload as { permanentId?: unknown } | null)?.permanentId;
  if (typeof permanentId !== "string") {
    throw new Error("Invalid grant activity payload");
  }
  const matches = createPermanentFilterMatchCallback(payload) as (permanentId: string) => boolean;
  return () => matches(permanentId);
}
