import { EffectTiming } from "@aegis/shared/schema/enums";
import type { GameEngine } from "#api/engine/GameEngine";
import { buildResolutionEnv } from "#api/engine/effects/resolution";
import { resolveTiming, type ResolutionEnv } from "#api/engine/effects/stack";
import { TimingWindowState } from "#api/engine/effects/resolution/TimingWindowState";
import type { ResolutionEnvironmentSnapshot } from "#api/engine/effects/resolution/ResolutionEnvironmentSnapshot";
import { effectEnvironmentSnapshots } from "#api/engine/effects/resolution/effectEnvironmentSnapshots";
import { resolutionEnvironmentSnapshots } from "#api/engine/effects/resolution/resolutionEnvironmentSnapshots";
import { effectEnvironment } from "#api/engine/gameEngine/effectContext";
import type { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";
import { EngineRuntimeObjectKind } from "#api/engine/snapshot/context/EngineRuntimeObjectKind";
import { EngineRuntimeCallbackKind } from "#api/engine/snapshot/context/EngineRuntimeCallbackKind";

type Params = { engine: GameEngine; objects: RuntimeObjectRegistry };
type PortsParams = { value: object; ports: Map<string, unknown> };
type DrainPayload = { timing: EffectTiming; state: TimingWindowState; environment: ResolutionEnv };
type DrainOptions = { retireUnactivatable?: boolean };

export function registerResolutionEnvironmentFactory({ engine, objects }: Params): void {
  objects.registerFactory({
    key: EngineRuntimeObjectKind.RESOLUTION_ENVIRONMENT.value,
    allocate: () => ({}),
    describe: (value) => {
      const metadata = resolutionEnvironmentSnapshots.get(value as ResolutionEnv);
      const frameworkPorts = metadata === undefined ? undefined : effectEnvironmentSnapshots.get(metadata.framework);
      if (
        metadata === undefined ||
        frameworkPorts === undefined ||
        !hasOriginalPorts({ value, ports: metadata.ports }) ||
        !hasOriginalPorts({ value: metadata.framework, ports: frameworkPorts })
      ) {
        throw new Error("Resolution environment requires specialized runtime ports");
      }
      return metadata.payload;
    },
    hydrate: ({ value, payload }) => {
      if (!isEnvironmentSnapshot(payload)) {
        throw new Error("Invalid resolution environment payload");
      }
      const environment = buildResolutionEnv(
        effectEnvironment(engine, payload.trigger),
        payload.dependencies,
        payload.grants,
      );
      Object.assign(value, environment);
      resolutionEnvironmentSnapshots.set(value as ResolutionEnv, resolutionEnvironmentSnapshots.get(environment)!);
    },
  });
  engine.runtimeCallbacks.registerFactory({
    key: EngineRuntimeCallbackKind.TIMING_DRAIN.value,
    create: (payload) => {
      if (!isDrainPayload(payload)) {
        throw new Error("Invalid timing drain payload");
      }
      return async (options?: DrainOptions) => {
        await resolveTiming(payload.timing, payload.environment, { state: payload.state, options });
      };
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

function isEnvironmentSnapshot(value: unknown): value is ResolutionEnvironmentSnapshot {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const payload = value as ResolutionEnvironmentSnapshot;
  return (
    payload.trigger !== null &&
    typeof payload.trigger === "object" &&
    payload.dependencies !== null &&
    typeof payload.dependencies === "object" &&
    typeof payload.dependencies.collectPending === "function" &&
    typeof payload.dependencies.listCandidateInstances === "function" &&
    payload.grants !== null &&
    typeof payload.grants === "object" &&
    Array.isArray(payload.grants.stackEffectConferrals) &&
    Array.isArray(payload.grants.customEffectGrants) &&
    Array.isArray(payload.grants.onDeletionAtEndOfAttackProjections)
  );
}

function isDrainPayload(value: unknown): value is DrainPayload {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const payload = value as DrainPayload;
  return (
    typeof payload.timing === "number" &&
    Object.values(EffectTiming).includes(payload.timing) &&
    payload.state instanceof TimingWindowState &&
    payload.state.timing === payload.timing &&
    payload.environment !== null &&
    typeof payload.environment === "object" &&
    typeof payload.environment.collect === "function" &&
    typeof payload.environment.makeContext === "function"
  );
}
