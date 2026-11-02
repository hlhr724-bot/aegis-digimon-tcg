import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { DecisionEffectSummary } from "@aegis/shared/protocol/DecisionEffectSummary";
import { getDecisionEffectSummary } from "#api/engine/effects/interpreter/getDecisionEffectSummary";

interface GetSubTriggerDecisionSummaryParams {
  action: Extract<Action, { kind: "SubTrigger" }>;
}

const cache = new WeakMap<Action, DecisionEffectSummary>();

export function getSubTriggerDecisionSummary({ action }: GetSubTriggerDecisionSummaryParams): DecisionEffectSummary {
  const cached = cache.get(action);
  if (cached !== undefined) {
    return cached;
  }
  const payment: Action = {
    kind: "Draw",
    controller: "mine",
    amount: 0,
    ...(action.cost === undefined ? {} : { cost: action.cost }),
    ...(action.costOptions === undefined ? {} : { costOptions: action.costOptions }),
    ...(action.additionalCost === undefined ? {} : { additionalCost: action.additionalCost }),
    ...(action.additionalCosts === undefined ? {} : { additionalCosts: action.additionalCosts }),
  };
  const summary = getDecisionEffectSummary({ actions: [payment, ...action.actions] });
  cache.set(action, summary);
  return summary;
}
