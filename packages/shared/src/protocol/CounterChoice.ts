import type { DecisionEffectSummary } from "#shared/protocol/DecisionEffectSummary";

export type CounterChoice = {
  instanceId: string;
  effectKey: string;
  description: string;
  sourceCardId?: string;
  summary?: DecisionEffectSummary;
};
