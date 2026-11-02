import { CardInstance } from "@aegis/shared/schema/CardInstance";
import { Permanent } from "@aegis/shared/schema/Permanent";
import { ResolutionCandidateKind } from "#api/engine/effects/resolution/ResolutionCandidateKind";
import type { ResolutionCandidatePayload } from "#api/engine/effects/resolution/ResolutionCandidateScope";

export function isResolutionCandidatePayload(value: unknown): value is ResolutionCandidatePayload {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const payload = value as ResolutionCandidatePayload;
  if (payload.scope === null || typeof payload.scope !== "object") {
    return false;
  }
  if (
    payload.transientCandidates !== undefined &&
    (!Array.isArray(payload.transientCandidates) ||
      !payload.transientCandidates.every((instance) => instance instanceof CardInstance))
  ) {
    return false;
  }
  if (payload.permanent !== undefined && !(payload.permanent instanceof Permanent)) {
    return false;
  }
  const scope = payload.scope;
  switch (scope.kind) {
    case ResolutionCandidateKind.ALL.value:
    case ResolutionCandidateKind.NONE.value:
      return true;
    case ResolutionCandidateKind.INSTANCES.value:
      return Array.isArray(scope.instanceIds) && scope.instanceIds.every((id) => typeof id === "string");
    case ResolutionCandidateKind.BOUNDARY.value:
      return (
        scope.locations instanceof Map &&
        [...scope.locations].every(
          ([id, location]) => typeof id === "string" && (location === undefined || typeof location === "string"),
        )
      );
    case ResolutionCandidateKind.PERMANENT.value:
      return (
        typeof scope.permanentId === "string" &&
        typeof scope.resident === "boolean" &&
        Array.isArray(scope.instanceIds) &&
        scope.instanceIds.every((id) => typeof id === "string")
      );
    default:
      return false;
  }
}
