import { createPermanentFilterMatch } from "#api/engine/effects/interpreter/matching/createPermanentFilterMatch";
import type { PermanentFilterMatchParams } from "#api/engine/effects/interpreter/matching/PermanentFilterMatchParams";
import { InterpreterCallbackKind } from "#api/engine/effects/interpreter/snapshot/InterpreterCallbackKind";
import { EngineRuntimeObjectKind } from "#api/engine/snapshot/context/EngineRuntimeObjectKind";

type Params = PermanentFilterMatchParams & { permanentId: string };

export function createTrackedGrantActivity(params: Params): () => boolean {
  const registry = params.ctx.game?.runtimeCallbacks;
  if (registry === undefined) {
    const matches = createPermanentFilterMatch(params);
    return () => matches(params.permanentId);
  }
  params.ctx.game?.runtimeObjects?.track({ value: params.ctx, key: EngineRuntimeObjectKind.EFFECT_CONTEXT.value });
  return registry.create<() => boolean>({ key: InterpreterCallbackKind.GRANT_ACTIVITY.value, payload: params });
}
