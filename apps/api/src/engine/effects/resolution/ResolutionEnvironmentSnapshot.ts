import type { TriggerInfo } from "#api/engine/effects/context/triggers";
import type { ResolutionDeps, eventGrantSnapshot } from "#api/engine/effects/resolution";

export type ResolutionEnvironmentSnapshot = {
  trigger: TriggerInfo;
  grants: ReturnType<typeof eventGrantSnapshot>;
  dependencies: ResolutionDeps;
};
