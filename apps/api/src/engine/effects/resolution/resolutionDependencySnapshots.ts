import type { ResolutionDeps } from "#api/engine/effects/resolution";
import type { ResolutionDependencySnapshot } from "#api/engine/effects/resolution/ResolutionDependencySnapshot";

export const resolutionDependencySnapshots = new WeakMap<
  ResolutionDeps,
  {
    state: ResolutionDependencySnapshot;
    ports: Map<string, unknown>;
  }
>();
