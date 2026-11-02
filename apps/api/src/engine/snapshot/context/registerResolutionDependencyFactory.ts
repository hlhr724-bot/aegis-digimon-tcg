import type { GameEngine } from "#api/engine/GameEngine";
import type { ResolutionDeps } from "#api/engine/effects/resolution";
import type { ResolutionDependencySnapshot } from "#api/engine/effects/resolution/ResolutionDependencySnapshot";
import { resolutionDependencySnapshots } from "#api/engine/effects/resolution/resolutionDependencySnapshots";
import { resolutionDeps } from "#api/engine/gameEngine/actionDeps";
import { buildResolutionCandidateReader } from "#api/engine/effects/resolution/buildResolutionCandidateReader";
import { isResolutionCandidatePayload } from "#api/engine/effects/resolution/isResolutionCandidatePayload";
import { ResolutionCandidateKind } from "#api/engine/effects/resolution/ResolutionCandidateKind";
import type { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";
import { EngineRuntimeObjectKind } from "#api/engine/snapshot/context/EngineRuntimeObjectKind";
import { EngineRuntimeCallbackKind } from "#api/engine/snapshot/context/EngineRuntimeCallbackKind";

type Params = { engine: GameEngine; objects: RuntimeObjectRegistry };
type PortsParams = { value: object; ports: Map<string, unknown> };

export function registerResolutionDependencyFactory({ engine, objects }: Params): void {
  engine.runtimeCallbacks.registerFactory({
    key: EngineRuntimeCallbackKind.RESOLUTION_CANDIDATES.value,
    create: (payload) => {
      if (!isResolutionCandidatePayload(payload)) {
        throw new Error("Invalid resolution candidate payload");
      }
      return buildResolutionCandidateReader({ engine, payload });
    },
    snapshotPayload: (payload) => {
      if (!isResolutionCandidatePayload(payload)) {
        throw new Error("Invalid resolution candidate payload");
      }
      const scope = payload.scope;
      if (scope.kind === ResolutionCandidateKind.PERMANENT.value) {
        const resident =
          payload.permanent !== undefined && engine.access.permanentById(scope.permanentId) === payload.permanent;
        return {
          scope: { ...scope, resident },
          permanent: resident ? undefined : payload.permanent,
          transientCandidates: payload.transientCandidates,
        };
      }
      return { scope, transientCandidates: payload.transientCandidates };
    },
  });
  objects.registerFactory({
    key: EngineRuntimeObjectKind.RESOLUTION_DEPENDENCIES.value,
    allocate: () => ({}),
    describe: (value) => {
      const metadata = resolutionDependencySnapshots.get(value as ResolutionDeps);
      if (metadata === undefined || !hasOriginalPorts({ value, ports: metadata.ports })) {
        throw new Error("Resolution dependencies require specialized runtime ports");
      }
      return metadata.state;
    },
    hydrate: ({ value, payload }) => {
      if (!isDependencySnapshot(payload)) {
        throw new Error("Invalid resolution dependency payload");
      }
      const dependencies = resolutionDeps(engine, payload.listCandidate, { runtimeState: payload });
      Object.assign(value, dependencies);
      resolutionDependencySnapshots.set(value as ResolutionDeps, resolutionDependencySnapshots.get(dependencies)!);
    },
  });
}

function hasOriginalPorts({ value, ports }: PortsParams): boolean {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return (
    Object.getOwnPropertySymbols(value).length === 0 &&
    Object.keys(descriptors).length === ports.size &&
    [...ports].every(([key, port]) => {
      const descriptor = descriptors[key];
      return (
        descriptor !== undefined &&
        descriptor.get === undefined &&
        descriptor.set === undefined &&
        descriptor.value === port
      );
    })
  );
}

function isDependencySnapshot(value: unknown): value is ResolutionDependencySnapshot {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const payload = value as ResolutionDependencySnapshot;
  return (
    (payload.turnSeat === 0 || payload.turnSeat === 1) &&
    typeof payload.listCandidate === "function" &&
    (payload.outermost === undefined || typeof payload.outermost === "boolean") &&
    (payload.extraPending === undefined || Array.isArray(payload.extraPending)) &&
    (payload.excludeNestedPending === undefined || payload.excludeNestedPending instanceof Set) &&
    payload.excludedWindowWatchers instanceof Set &&
    Array.isArray(payload.derivedPending) &&
    payload.announced instanceof Set
  );
}
