import type { Effect } from "#api/engine/effects/Effect";
import type { RuntimeEffectSnapshot } from "#api/engine/effects/interpreter/snapshot/RuntimeEffectSnapshot";
import type { RuntimeCallback } from "#api/engine/snapshot/RuntimeCallback";
import { runtimeEffectSnapshots } from "#api/engine/effects/interpreter/snapshot/runtimeEffectSnapshots";
import { sourceRuntimeObjectRegistries } from "#api/engine/snapshot/context/sourceRuntimeObjectRegistries";
import { EngineRuntimeObjectKind } from "#api/engine/snapshot/context/EngineRuntimeObjectKind";

type Params = Omit<RuntimeEffectSnapshot, "methods"> & { effect: Effect };

export function trackRuntimeEffect({ effect, cardId, timing, index, source, definition }: Params): void {
  const objects = sourceRuntimeObjectRegistries.get(source);
  if (objects === undefined || !objects.snapshotsEnabled) {
    return;
  }
  const methods = new Map<string, RuntimeCallback>();
  const properties = effect as unknown as Record<string, unknown>;
  for (const key of Object.keys(properties)) {
    const value = properties[key];
    if (typeof value === "function") {
      methods.set(key, value as RuntimeCallback);
    }
  }
  runtimeEffectSnapshots.set(effect, { cardId, timing, index, source, definition, methods });
  objects.track({ value: effect, key: EngineRuntimeObjectKind.IR_EFFECT.value });
}
