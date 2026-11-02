import type { RuntimeReferenceRegistry } from "#api/engine/snapshot/RuntimeReferenceRegistry";
import { EffectTiming } from "@aegis/shared/schema/enums";
import { ResolutionPlan } from "#api/engine/decisions/resolutionPlan";
import type { CollectedEffect } from "#api/engine/effects/collect";
import type { TimingWindowData } from "#api/engine/effects/resolution/TimingWindowData";
import type { RuntimeCallbackRegistry } from "#api/engine/snapshot/RuntimeCallbackRegistry";
import type { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";
import type { RuntimeGraphSnapshot } from "#api/engine/snapshot/RuntimeGraphSnapshot";
import { encodeRuntimeGraph } from "#api/engine/snapshot/encodeRuntimeGraph";
import { decodeRuntimeGraph } from "#api/engine/snapshot/decodeRuntimeGraph";

type Params = { timing: EffectTiming; passBudget: number };
type SnapshotParams = {
  callbacks?: RuntimeCallbackRegistry;
  objects?: RuntimeObjectRegistry;
  references?: RuntimeReferenceRegistry;
};
type RestoreParams = {
  snapshot: RuntimeGraphSnapshot;
  callbacks?: RuntimeCallbackRegistry;
  objects?: RuntimeObjectRegistry;
  references?: RuntimeReferenceRegistry;
};

export class TimingWindowState implements TimingWindowData {
  timing: EffectTiming;
  plan: ResolutionPlan = new ResolutionPlan();
  declined: Set<string> = new Set();
  loopStopped: Set<string> = new Set();
  resolved: Set<string> = new Set();
  inProgress: Set<string> = new Set();
  activationTiers: Map<string, number> = new Map();
  newestTier: number = 0;
  everCollected: Set<string> = new Set();
  departed: Set<string> = new Set();
  identityAtFirstCollect: Map<string, string> = new Map();
  passes: number = 0;
  passBudget: number;
  stopAttempts: number = 0;
  lastCollected: readonly CollectedEffect[] = [];
  sourceArrivals: Map<string, { source: number | undefined; host: number | undefined }> = new Map();
  reportedWithoutLegalOutcome: Set<string> = new Set();
  scopeOpen: boolean = false;
  activeDrains: number = 0;

  constructor({ timing, passBudget }: Params) {
    if (
      !Number.isSafeInteger(passBudget) ||
      passBudget < 1 ||
      typeof timing !== "number" ||
      !Object.values(EffectTiming).includes(timing)
    ) {
      throw new Error("Invalid timing window configuration");
    }
    this.timing = timing;
    this.passBudget = passBudget;
  }

  getRuntimeState(): TimingWindowData {
    if (this.scopeOpen || this.activeDrains > 0 || this.inProgress.size > 0) {
      throw new Error("Cannot snapshot an active timing window");
    }
    return {
      timing: this.timing,
      plan: this.plan,
      declined: this.declined,
      loopStopped: this.loopStopped,
      resolved: this.resolved,
      inProgress: this.inProgress,
      activationTiers: this.activationTiers,
      newestTier: this.newestTier,
      everCollected: this.everCollected,
      departed: this.departed,
      identityAtFirstCollect: this.identityAtFirstCollect,
      passes: this.passes,
      passBudget: this.passBudget,
      stopAttempts: this.stopAttempts,
      lastCollected: this.lastCollected,
      sourceArrivals: this.sourceArrivals,
      reportedWithoutLegalOutcome: this.reportedWithoutLegalOutcome,
      scopeOpen: this.scopeOpen,
      activeDrains: this.activeDrains,
    };
  }

  restoreRuntimeState(value: unknown): void {
    if (this.scopeOpen || this.activeDrains > 0 || this.inProgress.size > 0 || !isTimingWindowData(value)) {
      throw new Error("Invalid or active timing window state");
    }
    this.timing = value.timing;
    this.plan = value.plan;
    this.declined = value.declined;
    this.loopStopped = value.loopStopped;
    this.resolved = value.resolved;
    this.inProgress = value.inProgress;
    this.activationTiers = value.activationTiers;
    this.newestTier = value.newestTier;
    this.everCollected = value.everCollected;
    this.departed = value.departed;
    this.identityAtFirstCollect = value.identityAtFirstCollect;
    this.passes = value.passes;
    this.passBudget = value.passBudget;
    this.stopAttempts = value.stopAttempts;
    this.lastCollected = value.lastCollected;
    this.sourceArrivals = value.sourceArrivals;
    this.reportedWithoutLegalOutcome = value.reportedWithoutLegalOutcome;
    this.scopeOpen = value.scopeOpen;
    this.activeDrains = value.activeDrains;
  }

  snapshot({ callbacks, objects, references }: SnapshotParams = {}): RuntimeGraphSnapshot {
    return encodeRuntimeGraph({
      value: this.getRuntimeState(),
      describeCallback: callbacks?.describe.bind(callbacks),
      describeObject: objects?.describe.bind(objects),
      references,
    });
  }

  restore({ snapshot, callbacks, objects, references }: RestoreParams): void {
    this.restoreRuntimeState(
      decodeRuntimeGraph({ snapshot, createCallback: callbacks?.create.bind(callbacks), objects, references }),
    );
  }
}

function isTimingWindowData(value: unknown): value is TimingWindowData {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const state = value as TimingWindowData;
  if (
    state.scopeOpen !== false ||
    state.activeDrains !== 0 ||
    typeof state.timing !== "number" ||
    !Object.values(EffectTiming).includes(state.timing) ||
    !(state.plan instanceof ResolutionPlan)
  ) {
    return false;
  }
  const sets = [
    state.declined,
    state.loopStopped,
    state.resolved,
    state.inProgress,
    state.everCollected,
    state.departed,
    state.reportedWithoutLegalOutcome,
  ];
  if (
    !sets.every((set) => set instanceof Set && [...set].every((key) => typeof key === "string")) ||
    state.inProgress.size !== 0
  ) {
    return false;
  }
  if (
    ![state.newestTier, state.passes, state.passBudget, state.stopAttempts].every(
      (count) => Number.isSafeInteger(count) && count >= 0,
    ) ||
    state.passBudget < 1
  ) {
    return false;
  }
  if (
    !(state.activationTiers instanceof Map) ||
    !(state.identityAtFirstCollect instanceof Map) ||
    !(state.sourceArrivals instanceof Map) ||
    !Array.isArray(state.lastCollected)
  ) {
    return false;
  }
  return (
    [...state.activationTiers].every(
      ([key, tier]) => typeof key === "string" && Number.isSafeInteger(tier) && tier >= 0,
    ) &&
    [...state.identityAtFirstCollect].every(
      ([key, identity]) => typeof key === "string" && typeof identity === "string",
    )
  );
}
