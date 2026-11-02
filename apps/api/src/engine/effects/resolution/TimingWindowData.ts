import type { EffectTiming } from "@aegis/shared/schema/enums";
import type { ResolutionPlan } from "#api/engine/decisions/resolutionPlan";
import type { CollectedEffect } from "#api/engine/effects/collect";

export type TimingWindowData = {
  timing: EffectTiming;
  plan: ResolutionPlan;
  declined: Set<string>;
  loopStopped: Set<string>;
  resolved: Set<string>;
  inProgress: Set<string>;
  activationTiers: Map<string, number>;
  newestTier: number;
  everCollected: Set<string>;
  departed: Set<string>;
  identityAtFirstCollect: Map<string, string>;
  passes: number;
  passBudget: number;
  stopAttempts: number;
  lastCollected: readonly CollectedEffect[];
  sourceArrivals: Map<string, { source: number | undefined; host: number | undefined }>;
  reportedWithoutLegalOutcome: Set<string>;
  scopeOpen: boolean;
  activeDrains: number;
};
