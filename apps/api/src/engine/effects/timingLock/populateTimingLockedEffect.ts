import type { ContinuousEffectLedger } from "#api/engine/effects/continuous";
import type { Effect } from "#api/engine/effects/Effect";
import type { EffectContext } from "#api/engine/effects/EffectContext";
import { isTimingActivationDisabled } from "#api/engine/effects/timingActivation";
import type { TimingLockedEffectPayload } from "#api/engine/effects/timingLock/TimingLockedEffectPayload";
import { timingLockedEffectPayloads } from "#api/engine/effects/timingLock/timingLockedEffectPayloads";

type Params = {
  target: object;
  payload: TimingLockedEffectPayload;
  continuous: ContinuousEffectLedger;
};

export function populateTimingLockedEffect({ target, payload, continuous }: Params): Effect {
  const { effect, source, mask } = payload;
  const canActivate = (ctx: EffectContext): boolean => {
    const permanent = source.permanent();
    if (permanent !== undefined && isTimingActivationDisabled(continuous, permanent.permanentId, mask)) {
      return false;
    }
    return effect.canActivate(ctx);
  };
  const locked = Object.assign(target, effect, { canActivate }) as Effect;
  timingLockedEffectPayloads.set(locked, { effect, source, mask, canActivate });
  return locked;
}
