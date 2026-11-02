import type { RuntimeCallback } from "#api/engine/snapshot/RuntimeCallback";
import type { SubTriggerCallbackPayload } from "#api/engine/effects/interpreter/subtriggers/SubTriggerCallbackPayload";
import { SubTriggerCallbackField } from "#api/engine/effects/interpreter/subtriggers/SubTriggerCallbackField";
import { MatchedTriggerHistory } from "#api/engine/effects/interpreter/subtriggers/MatchedTriggerHistory";
import { createSubTriggerInstall } from "#api/engine/effects/interpreter/subtriggers/createSubTriggerInstall";

export function createSubTriggerCallback(payload: unknown): RuntimeCallback {
  if (payload === null || typeof payload !== "object") {
    throw new Error("Invalid SubTrigger callback payload");
  }
  const { params, field } = payload as SubTriggerCallbackPayload;
  if (
    params === null ||
    typeof params !== "object" ||
    !(params.matchedEvents instanceof MatchedTriggerHistory) ||
    params.ctx === null ||
    typeof params.ctx !== "object" ||
    params.action?.kind !== "SubTrigger" ||
    typeof params.event !== "string" ||
    typeof params.sourceSelfInstanceId !== "string" ||
    typeof params.playerScoped !== "boolean" ||
    typeof params.isLinkedSource !== "boolean" ||
    typeof params.isInheritedSource !== "boolean" ||
    typeof params.bindsPrintedSource !== "boolean" ||
    typeof params.linkedSelfSourceAtInstall !== "boolean" ||
    !Object.values(SubTriggerCallbackField).some((entry) => entry.value === field)
  ) {
    throw new Error("Invalid SubTrigger callback payload");
  }
  const callback = createSubTriggerInstall(params)[field];
  if (typeof callback !== "function") {
    throw new Error("SubTrigger callback is absent from its installation");
  }
  return callback;
}
