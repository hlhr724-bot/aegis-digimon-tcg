import { EngineRuntimeObjectKind } from "#api/engine/snapshot/context/EngineRuntimeObjectKind";
import type { SubTriggerInstall } from "#api/engine/effects/context/subTriggers";
import { InterpreterCallbackKind } from "#api/engine/effects/interpreter/snapshot/InterpreterCallbackKind";
import { SubTriggerCallbackField } from "#api/engine/effects/interpreter/subtriggers/SubTriggerCallbackField";
import type { SubTriggerInstallParams } from "#api/engine/effects/interpreter/subtriggers/SubTriggerInstallParams";

type Params = { params: SubTriggerInstallParams; install: SubTriggerInstall };

export function trackSubTriggerInstallCallbacks({ params, install }: Params): void {
  const registry = params.ctx.game?.runtimeCallbacks;
  if (registry === undefined) {
    return;
  }
  params.ctx.game?.runtimeObjects?.track({ value: params.ctx, key: EngineRuntimeObjectKind.EFFECT_CONTEXT.value });
  for (const { value: field } of Object.values(SubTriggerCallbackField)) {
    const callback = install[field];
    if (callback !== undefined) {
      registry.track({ callback, key: InterpreterCallbackKind.SUBTRIGGER.value, payload: { params, field } });
    }
  }
}
