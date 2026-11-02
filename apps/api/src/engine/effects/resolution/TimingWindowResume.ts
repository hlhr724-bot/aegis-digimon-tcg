import type { TimingWindowState } from "#api/engine/effects/resolution/TimingWindowState";

export type TimingWindowResume = { state: TimingWindowState; options?: { retireUnactivatable?: boolean } };
