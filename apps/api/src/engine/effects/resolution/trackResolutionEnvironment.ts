import type { EffectEnvironment } from "#api/engine/effects/context";
import type { ResolutionEnv } from "#api/engine/effects/stack";
import type { ResolutionEnvironmentSnapshot } from "#api/engine/effects/resolution/ResolutionEnvironmentSnapshot";
import { effectEnvironmentSnapshots } from "#api/engine/effects/resolution/effectEnvironmentSnapshots";
import { resolutionDependencySnapshots } from "#api/engine/effects/resolution/resolutionDependencySnapshots";
import { resolutionEnvironmentSnapshots } from "#api/engine/effects/resolution/resolutionEnvironmentSnapshots";
import { EngineRuntimeObjectKind } from "#api/engine/snapshot/context/EngineRuntimeObjectKind";

type Params = { framework: EffectEnvironment; environment: ResolutionEnv; payload: ResolutionEnvironmentSnapshot };

export function trackResolutionEnvironment({ framework, environment, payload }: Params): void {
  if (!effectEnvironmentSnapshots.has(framework) || !resolutionDependencySnapshots.has(payload.dependencies)) {
    return;
  }
  resolutionEnvironmentSnapshots.set(environment, { framework, payload, ports: new Map(Object.entries(environment)) });
  framework.runtimeObjects?.track({ value: environment, key: EngineRuntimeObjectKind.RESOLUTION_ENVIRONMENT.value });
}
