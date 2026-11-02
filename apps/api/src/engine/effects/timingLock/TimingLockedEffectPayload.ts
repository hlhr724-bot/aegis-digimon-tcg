import type { DisableTiming } from "@aegis/shared/effects/ir/actions/statics";
import type { CardSource } from "#api/engine/effects/CardSource";
import type { Effect } from "#api/engine/effects/Effect";

export type TimingLockedEffectPayload = {
  effect: Effect;
  source: CardSource;
  mask: DisableTiming;
};
