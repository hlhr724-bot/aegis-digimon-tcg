import type { RuntimeCallback } from "#api/engine/snapshot/RuntimeCallback";
import { LeaveReplacementCallbackField } from "#api/engine/effects/interpreter/replacements/LeaveReplacementCallbackField";
import type { LeaveReplacementInstallParams } from "#api/engine/effects/interpreter/replacements/LeaveReplacementInstallParams";
import { createLeaveReplacementInstall } from "#api/engine/effects/interpreter/replacements/createLeaveReplacementInstall";

type Payload = { params: LeaveReplacementInstallParams; field: LeaveReplacementCallbackField };

export function createLeaveReplacementCallback(payload: unknown): RuntimeCallback {
  if (payload === null || typeof payload !== "object") {
    throw new Error("Invalid leave replacement callback payload");
  }
  const { params, field } = payload as Payload;
  if (
    params === null ||
    typeof params !== "object" ||
    params.ctx === null ||
    typeof params.ctx !== "object" ||
    params.action?.kind !== "Replacement" ||
    (params.mode !== "prevent" && params.mode !== "instead") ||
    typeof params.event !== "string" ||
    params.replacementBudget === null ||
    typeof params.replacementBudget !== "object" ||
    !Object.values(LeaveReplacementCallbackField).some((entry) => entry.value === field)
  ) {
    throw new Error("Invalid leave replacement callback payload");
  }
  const install = createLeaveReplacementInstall(params) as unknown as Record<string, unknown>;
  const callback = install[field];
  if (typeof callback !== "function") {
    throw new Error("Leave replacement callback is absent from its installation");
  }
  return callback as RuntimeCallback;
}
