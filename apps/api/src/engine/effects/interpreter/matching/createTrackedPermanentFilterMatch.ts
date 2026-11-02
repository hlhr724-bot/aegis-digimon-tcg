import { createPermanentFilterMatch } from "#api/engine/effects/interpreter/matching/createPermanentFilterMatch";
import type { PermanentFilterMatchParams } from "#api/engine/effects/interpreter/matching/PermanentFilterMatchParams";
import { InterpreterCallbackKind } from "#api/engine/effects/interpreter/snapshot/InterpreterCallbackKind";
import { EngineRuntimeObjectKind } from "#api/engine/snapshot/context/EngineRuntimeObjectKind";

export function createTrackedPermanentFilterMatch(
  params: PermanentFilterMatchParams,
): (permanentId: string) => boolean {
  const registry = params.ctx.game?.runtimeCallbacks;
  if (registry === undefined) {
    return createPermanentFilterMatch(params);
  }
  params.ctx.game?.runtimeObjects?.track({ value: params.ctx, key: EngineRuntimeObjectKind.EFFECT_CONTEXT.value });
  return registry.create<(permanentId: string) => boolean>({
    key: InterpreterCallbackKind.PERMANENT_FILTER_MATCH.value,
    payload: params,
  });
}
