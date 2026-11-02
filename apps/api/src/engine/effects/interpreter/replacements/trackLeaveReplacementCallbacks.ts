import type { ReplacementInstallInstead, ReplacementInstallPrevent } from "#api/engine/effects/context/replacements";
import type { RuntimeCallback } from "#api/engine/snapshot/RuntimeCallback";
import { LeaveReplacementCallbackField } from "#api/engine/effects/interpreter/replacements/LeaveReplacementCallbackField";
import type { LeaveReplacementInstallParams } from "#api/engine/effects/interpreter/replacements/LeaveReplacementInstallParams";
import { InterpreterCallbackKind } from "#api/engine/effects/interpreter/snapshot/InterpreterCallbackKind";
import { EngineRuntimeObjectKind } from "#api/engine/snapshot/context/EngineRuntimeObjectKind";

type Params = {
  params: LeaveReplacementInstallParams;
  install: ReplacementInstallPrevent | ReplacementInstallInstead;
};

export function trackLeaveReplacementCallbacks({ params, install }: Params): void {
  const registry = params.ctx.game?.runtimeCallbacks;
  if (registry === undefined) {
    return;
  }
  params.ctx.game?.runtimeObjects?.track({ value: params.ctx, key: EngineRuntimeObjectKind.EFFECT_CONTEXT.value });
  const fields = install as unknown as Record<string, unknown>;
  for (const { value: field } of Object.values(LeaveReplacementCallbackField)) {
    const callback = fields[field];
    if (typeof callback === "function") {
      registry.track({
        callback: callback as RuntimeCallback,
        key: InterpreterCallbackKind.LEAVE_REPLACEMENT.value,
        payload: { params, field },
      });
    }
  }
}
