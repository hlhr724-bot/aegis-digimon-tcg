import type { CostReplacementInstall } from "#api/engine/effects/interpreter/replacements/CostReplacementInstall";
import type { CostReplacementInstallParams } from "#api/engine/effects/interpreter/replacements/CostReplacementInstallParams";
import { CostReplacementCallbackField } from "#api/engine/effects/interpreter/replacements/CostReplacementCallbackField";
import { InterpreterCallbackKind } from "#api/engine/effects/interpreter/snapshot/InterpreterCallbackKind";
import { EngineRuntimeObjectKind } from "#api/engine/snapshot/context/EngineRuntimeObjectKind";

type Params = { params: CostReplacementInstallParams; install: CostReplacementInstall };

export function trackCostReplacementCallbacks({ params, install }: Params): void {
  const registry = params.ctx.game?.runtimeCallbacks;
  if (registry === undefined) {
    return;
  }
  params.ctx.game?.runtimeObjects?.track({ value: params.ctx, key: EngineRuntimeObjectKind.EFFECT_CONTEXT.value });
  for (const { value: field } of Object.values(CostReplacementCallbackField)) {
    const callback = install[field];
    if (callback !== undefined) {
      registry.track({ callback, key: InterpreterCallbackKind.COST_REPLACEMENT.value, payload: { params, field } });
    }
  }
}
