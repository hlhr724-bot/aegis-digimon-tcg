import type { TimingWindowState } from "#api/engine/effects/resolution/TimingWindowState";
import type { EffectContext } from "#api/engine/effects/context/effectContext";

export type TimingWindowRuntime = {
  state: TimingWindowState;
  drain: NonNullable<EffectContext["drainCurrentTimingWindow"]>;
};
