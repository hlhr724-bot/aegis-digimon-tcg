import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { SingleHandCostBenefit } from "@aegis/shared/protocol/SingleHandCostBenefit";
import { getSingleHandCostBenefit } from "#api/engine/effects/interpreter/getSingleHandCostBenefit";

interface GetSingleHandActionCostBenefitParams {
  action: Action;
}

const cache = new WeakMap<Action, SingleHandCostBenefit | null>();

export function getSingleHandActionCostBenefit({
  action,
}: GetSingleHandActionCostBenefitParams): SingleHandCostBenefit | undefined {
  if (cache.has(action)) {
    return cache.get(action) ?? undefined;
  }
  const benefit = getSingleHandCostBenefit({ actions: [action] });
  cache.set(action, benefit ?? null);
  return benefit;
}
