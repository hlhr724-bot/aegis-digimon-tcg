import type { EffectEnvironment } from "#api/engine/effects/context";
import type { ResolutionEnv } from "#api/engine/effects/stack";
import type { ResolutionEnvironmentSnapshot } from "#api/engine/effects/resolution/ResolutionEnvironmentSnapshot";

export const resolutionEnvironmentSnapshots = new WeakMap<
  ResolutionEnv,
  {
    payload: ResolutionEnvironmentSnapshot;
    framework: EffectEnvironment;
    ports: Map<string, unknown>;
  }
>();
