import type { EffectEnvironment } from "#api/engine/effects/context";

export const effectEnvironmentSnapshots = new WeakMap<EffectEnvironment, Map<string, unknown>>();
