import type { SubTriggerInstallParams } from "#api/engine/effects/interpreter/subtriggers/SubTriggerInstallParams";
import type { SubTriggerCallbackField } from "#api/engine/effects/interpreter/subtriggers/SubTriggerCallbackField";

export type SubTriggerCallbackPayload = { params: SubTriggerInstallParams; field: SubTriggerCallbackField };
