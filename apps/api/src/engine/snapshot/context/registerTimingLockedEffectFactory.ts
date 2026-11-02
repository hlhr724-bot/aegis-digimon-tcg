import type { GameEngine } from "#api/engine/GameEngine";
import type { Effect } from "#api/engine/effects/Effect";
import type { TimingLockedEffectPayload } from "#api/engine/effects/timingLock/TimingLockedEffectPayload";
import { timingLockedEffectPayloads } from "#api/engine/effects/timingLock/timingLockedEffectPayloads";
import { populateTimingLockedEffect } from "#api/engine/effects/timingLock/populateTimingLockedEffect";
import type { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";
import { EngineRuntimeObjectKind } from "#api/engine/snapshot/context/EngineRuntimeObjectKind";

type Params = { engine: GameEngine; objects: RuntimeObjectRegistry };

const TIMING_MASKS = new Set(["whenDigivolving", "whenAttacking", "onPlay"]);

export function registerTimingLockedEffectFactory({ engine, objects }: Params): void {
  objects.registerFactory({
    key: EngineRuntimeObjectKind.TIMING_LOCKED_EFFECT.value,
    allocate: () => ({}),
    describe: (value) => {
      const metadata = timingLockedEffectPayloads.get(value as Effect);
      if (metadata === undefined || !matchesLockedEffect({ value, metadata })) {
        throw new Error("Timing-locked effect changed after creation");
      }
      return { effect: metadata.effect, source: metadata.source, mask: metadata.mask };
    },
    hydrate: ({ value, payload }) => {
      if (!isPayload(payload)) {
        throw new Error("Invalid timing-locked effect payload");
      }
      populateTimingLockedEffect({ target: value, payload, continuous: engine.continuous });
    },
  });
}

function matchesLockedEffect({
  value,
  metadata,
}: {
  value: object;
  metadata: TimingLockedEffectPayload & { canActivate: Effect["canActivate"] };
}): boolean {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const effectKeys = Object.keys(metadata.effect);
  if (Object.getOwnPropertySymbols(value).length > 0) {
    return false;
  }
  if (Object.keys(descriptors).length !== new Set([...effectKeys, "canActivate"]).size) {
    return false;
  }
  return Object.entries(descriptors).every(([key, descriptor]) => {
    if (descriptor.get !== undefined || descriptor.set !== undefined) {
      return false;
    }
    if (key === "canActivate") {
      return descriptor.value === metadata.canActivate;
    }
    return descriptor.value === (metadata.effect as unknown as Record<string, unknown>)[key];
  });
}

function isPayload(value: unknown): value is TimingLockedEffectPayload {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const payload = value as TimingLockedEffectPayload;
  return (
    payload.effect !== null &&
    typeof payload.effect === "object" &&
    typeof payload.effect.canActivate === "function" &&
    payload.source !== null &&
    typeof payload.source === "object" &&
    typeof payload.source.permanent === "function" &&
    TIMING_MASKS.has(payload.mask)
  );
}
