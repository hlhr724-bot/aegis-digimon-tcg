import type { DecisionEffectSummary } from "@aegis/shared/protocol/DecisionEffectSummary";

export type FixedDefaultExample = {
  sourceCardId?: string;
  promptText?: string;
  effectText?: string;
  selectionGoal?: string;
  purpose?: string;
  effectSummary?: DecisionEffectSummary;
  answer?: string;
  reversedAnswer?: string;
};

export type FixedDefaultBucket = { count: number; cards: Record<string, number>; examples: FixedDefaultExample[] };

export type FixedDefaultTally = {
  decisions: Record<string, number>;
  nontrivialDecisions: number;
  fixedDefaults: number;
  buckets: Record<string, FixedDefaultBucket>;
};
