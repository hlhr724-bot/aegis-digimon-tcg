import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { DecisionEffectSummary } from "@aegis/shared/protocol/DecisionEffectSummary";
import { getDecisionEffectSummary } from "#api/engine/effects/interpreter/getDecisionEffectSummary";

interface GetDecisionActionSummaryParams {
  action: Action;
}

const cache = new WeakMap<Action, DecisionEffectSummary>();

export function getDecisionActionSummary({ action }: GetDecisionActionSummaryParams): DecisionEffectSummary {
  const cached = cache.get(action);
  if (cached !== undefined) {
    return cached;
  }
  const summary = getDecisionEffectSummary({ actions: [action] });
  cache.set(action, summary);
  return summary;
}
