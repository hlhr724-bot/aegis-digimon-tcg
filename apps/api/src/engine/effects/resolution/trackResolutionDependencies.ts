import type { GameEngine } from "#api/engine/GameEngine";
import type { ResolutionDeps } from "#api/engine/effects/resolution";
import type { ResolutionDependencySnapshot } from "#api/engine/effects/resolution/ResolutionDependencySnapshot";
import { resolutionDependencySnapshots } from "#api/engine/effects/resolution/resolutionDependencySnapshots";
import { EngineRuntimeObjectKind } from "#api/engine/snapshot/context/EngineRuntimeObjectKind";

type Params = { engine: GameEngine; dependencies: ResolutionDeps; state: ResolutionDependencySnapshot };

export function trackResolutionDependencies({ engine, dependencies, state }: Params): void {
  resolutionDependencySnapshots.set(dependencies, { state, ports: new Map(Object.entries(dependencies)) });
  engine.runtimeObjects.track({ value: dependencies, key: EngineRuntimeObjectKind.RESOLUTION_DEPENDENCIES.value });
}
