import type { Action } from "@aegis/shared";
import type { EffectContext } from "#api/engine/effects/EffectContext";
import { evaluateCondition } from "#api/engine/effects/interpreter/conditions";
import { scaleFactor } from "#api/engine/effects/interpreter/scaling";

type GetPaidPlayCostReductionParams = {
  ctx: EffectContext;
  action: Extract<Action, { kind: "PlayWithoutCost" }>;
};

export function getPaidPlayCostReduction({ ctx, action }: GetPaidPlayCostReductionParams): number | undefined {
  const base = action.reduceCostBy;
  const conditional = action.reduceCostByIf;
  if (base === undefined && action.reduceCostByScaling === undefined && conditional === undefined) {
    return undefined;
  }
  const scaling = action.reduceCostByScaling === undefined ? 0 : scaleFactor(ctx, action.reduceCostByScaling);
  const conditionalAmount =
    conditional !== undefined && evaluateCondition(ctx, conditional.condition) ? conditional.amount : 0;
  return (base ?? 0) + scaling + conditionalAmount;
}
