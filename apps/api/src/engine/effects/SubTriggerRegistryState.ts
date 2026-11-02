import type { ReplacementSubscription, SubTriggerSubscription } from "#api/engine/effects/subtriggers";

export type SubTriggerRegistryState = {
  subscriptions: SubTriggerSubscription[];
  replacements: (ReplacementSubscription & { id: number })[];
  sequence: number;
  oncePerTimingFiredFor: Map<number | string, unknown>;
};
