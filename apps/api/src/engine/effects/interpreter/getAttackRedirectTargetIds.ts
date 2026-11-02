import type { ActionBase } from "@aegis/shared/effects/ir/actions/base";
import type { Cost } from "@aegis/shared/effects/ir/predicates/costs";
import { hasAttackRedirection } from "#api/engine/effects/interpreter/hasAttackRedirection";
import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { EffectContext } from "#api/engine/effects/context/effectContext";
import { evaluateCondition } from "#api/engine/effects/interpreter/conditions";
import { canPayCost } from "#api/engine/effects/interpreter/cost/canPay";
import { candidatePermanents } from "#api/engine/effects/interpreter/targeting/permanents";

type Params = {
  ctx: EffectContext;
  actions: readonly Action[];
  activation?: ActionBase;
};

export function getAttackRedirectTargetIds({ ctx, actions, activation }: Params): string[] {
  if (activation !== undefined && !canPayVisibleActivation({ ctx, action: activation })) {
    return [];
  }
  const targets = new Set<string>();
  for (const action of actions) {
    if (!hasAttackRedirection([action])) {
      continue;
    }
    if (
      action.kind !== "ConditionalBranch" &&
      action.condition !== undefined &&
      !evaluateCondition(ctx, action.condition)
    ) {
      continue;
    }
    if (!canPayVisibleActivation({ ctx, action })) {
      continue;
    }
    if (action.kind === "RedirectAttack" && action.mode !== "endAttack" && action.chooser !== "opponent") {
      for (const permanent of candidatePermanents(ctx, action.target, { includeUnaffectable: true })) {
        if (permanent.controllerSeat === ctx.source.ownerSeat && !permanent.inBreeding) {
          targets.add(permanent.permanentId);
        }
      }
    } else if (action.kind === "ConditionalBranch") {
      const branch = evaluateCondition(ctx, action.condition) ? action.ifTrue : (action.ifFalse ?? []);
      for (const id of getAttackRedirectTargetIds({ ctx, actions: branch })) {
        targets.add(id);
      }
    } else if (action.kind === "CostGatedBlock") {
      for (const id of getAttackRedirectTargetIds({ ctx, actions: action.actions })) {
        targets.add(id);
      }
    }
  }
  return [...targets];
}

type CostParams = { ctx: EffectContext; cost: Cost };

function canPayVisibleCost({ ctx, cost }: CostParams): boolean {
  if (cost.kind === "compound") {
    return (cost.costs ?? []).every((entry) => canPayVisibleCost({ ctx, cost: entry }));
  }
  const zones = cost.target?.from ?? cost.target?.filter.zone;
  const fromHand = zones === "hand" || (Array.isArray(zones) && zones.includes("hand"));
  if (fromHand) {
    const count = cost.target?.count;
    const required = typeof count === "number" ? count : 1;
    return ctx.game.player(ctx.source.ownerSeat).hand.length >= required;
  }
  return canPayCost(ctx, cost);
}

type ActivationParams = { ctx: EffectContext; action: Omit<ActionBase, "cost"> & { cost?: Cost | number } };

function canPayVisibleActivation({ ctx, action }: ActivationParams): boolean {
  const costs = [...(action.additionalCosts ?? [])];
  if (action.additionalCost !== undefined) {
    costs.push(action.additionalCost);
  }
  if (action.cost !== undefined && typeof action.cost !== "number") {
    costs.push(action.cost);
  }
  if (!costs.every((cost) => canPayVisibleCost({ ctx, cost }))) {
    return false;
  }
  return !action.costOptions?.length || action.costOptions.some((cost) => canPayVisibleCost({ ctx, cost }));
}
