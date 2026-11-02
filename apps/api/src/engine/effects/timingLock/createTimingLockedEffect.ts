import type { ContinuousEffectLedger } from "#api/engine/effects/continuous";
import type { Effect } from "#api/engine/effects/Effect";
import type { TimingLockedEffectPayload } from "#api/engine/effects/timingLock/TimingLockedEffectPayload";
import { populateTimingLockedEffect } from "#api/engine/effects/timingLock/populateTimingLockedEffect";
import type { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";
import { EngineRuntimeObjectKind } from "#api/engine/snapshot/context/EngineRuntimeObjectKind";

type Params = {
  payload: TimingLockedEffectPayload;
  continuous: ContinuousEffectLedger;
  runtimeObjects?: RuntimeObjectRegistry;
};

export function createTimingLockedEffect({ payload, continuous, runtimeObjects }: Params): Effect {
  const locked = populateTimingLockedEffect({ target: {}, payload, continuous });
  runtimeObjects?.track({ value: locked, key: EngineRuntimeObjectKind.TIMING_LOCKED_EFFECT.value });
  return locked;
}
