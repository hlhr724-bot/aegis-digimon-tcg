import type { Effect } from "#api/engine/effects/Effect";
import type { TimingLockedEffectPayload } from "#api/engine/effects/timingLock/TimingLockedEffectPayload";

export const timingLockedEffectPayloads = new WeakMap<
  Effect,
  TimingLockedEffectPayload & { canActivate: Effect["canActivate"] }
>();
