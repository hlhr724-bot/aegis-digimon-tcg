import type { EffectContext } from "#api/engine/effects/context/effectContext";
import type { DelayedEffectPayload } from "#api/engine/effects/interpreter/snapshot/DelayedEffectPayload";
import { runAction } from "#api/engine/effects/interpreter/dispatch";

type Params = DelayedEffectPayload;

export function createDelayedEffectBody({ effect, bindings }: Params): (context: EffectContext) => Promise<void> {
  return async (context) => {
    if (bindings.boundPlayed !== undefined) {
      context.boundPlayed = new Map([...(context.boundPlayed ?? []), ...bindings.boundPlayed]);
    }
    if (bindings.boundCardInstances !== undefined) {
      context.boundCardInstances = new Map([...(context.boundCardInstances ?? []), ...bindings.boundCardInstances]);
    }
    if (bindings.selections !== undefined) {
      context.selections = new Map([...(context.selections ?? []), ...bindings.selections]);
    }
    if (bindings.namedCounts !== undefined) {
      context.namedCounts = new Map([...(context.namedCounts ?? []), ...bindings.namedCounts]);
    }
    await runAction(context, effect);
  };
}
