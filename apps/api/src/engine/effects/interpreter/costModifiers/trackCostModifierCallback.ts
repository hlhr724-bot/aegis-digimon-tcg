import type { RuntimeCallback } from "#api/engine/snapshot/RuntimeCallback";
import type { CostModifierCallbackField } from "#api/engine/effects/interpreter/costModifiers/CostModifierCallbackField";
import type { CostModifierMatchParams } from "#api/engine/effects/interpreter/costModifiers/CostModifierMatchParams";
import { InterpreterCallbackKind } from "#api/engine/effects/interpreter/snapshot/InterpreterCallbackKind";
import { EngineRuntimeObjectKind } from "#api/engine/snapshot/context/EngineRuntimeObjectKind";

type Params = { params: CostModifierMatchParams; callback: RuntimeCallback; field: CostModifierCallbackField };

export function trackCostModifierCallback({ params, callback, field }: Params): void {
  const registry = params.ctx.game?.runtimeCallbacks;
  if (registry === undefined) {
    return;
  }
  params.ctx.game?.runtimeObjects?.track({ value: params.ctx, key: EngineRuntimeObjectKind.EFFECT_CONTEXT.value });
  registry.track({ callback, key: InterpreterCallbackKind.COST_MODIFIER.value, payload: { params, field } });
}
