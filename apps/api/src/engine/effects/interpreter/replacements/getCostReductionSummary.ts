import type { DecisionEffectSummary } from "@aegis/shared/protocol/DecisionEffectSummary";

type Params = { amount: number };

export function getCostReductionSummary({ amount }: Params): DecisionEffectSummary {
  return {
    memoryGain: Math.max(0, amount),
    cardsDrawn: 0,
    cardsRecovered: 0,
    cardsReturnedFromTrash: 0,
    removal: 0,
    plays: 0,
    evolutions: 0,
    unsuspends: 0,
    memoryCost: { minimum: 0, maximum: 0 },
    uncertain: false,
  };
}
