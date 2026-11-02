import type { Effect } from "#api/engine/effects/Effect";
import type { RuntimeEffectSnapshot } from "#api/engine/effects/interpreter/snapshot/RuntimeEffectSnapshot";
import type { RuntimeCallback } from "#api/engine/snapshot/RuntimeCallback";
import { runtimeEffectSnapshots } from "#api/engine/effects/interpreter/snapshot/runtimeEffectSnapshots";
import { sourceRuntimeObjectRegistries } from "#api/engine/snapshot/context/sourceRuntimeObjectRegistries";
import { EngineRuntimeObjectKind } from "#api/engine/snapshot/context/EngineRuntimeObjectKind";

type Params = Omit<RuntimeEffectSnapshot, "methods"> & { effect: Effect };

export function trackRuntimeEffect({ effect, ...metadata }: Params): void {
  const objects = sourceRuntimeObjectRegistries.get(metadata.source);
  if (objects === undefined || !objects.snapshotsEnabled) {
    return;
  }
  const methods = new Map<string, RuntimeCallback>();
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(effect))) {
    if (typeof descriptor.value === "function") {
      methods.set(key, descriptor.value as RuntimeCallback);
    }
  }
  runtimeEffectSnapshots.set(effect, { ...metadata, methods });
  objects.track({ value: effect, key: EngineRuntimeObjectKind.IR_EFFECT.value });
}
