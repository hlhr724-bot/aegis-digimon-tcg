import type { EffectContext } from "#api/engine/effects/EffectContext";
import { canPayCost } from "#api/engine/effects/interpreter/cost/canPay";
import type { CardEffect } from "@aegis/shared/effects/ir/card";

type Params = { ctx: EffectContext; effect: CardEffect };

function cannotResolve(ctx: EffectContext, action: CardEffect["actions"][number]): boolean {
  return (
    action.kind !== "RawUnparsed" &&
    action.optional === true &&
    action.abortOnDecline === true &&
    "cost" in action &&
    typeof action.cost === "object" &&
    !canPayCost(ctx, action.cost)
  );
}

export function keepsFollowUpAfterDeclinedTarget({ ctx, effect }: Params): boolean {
  const [first, ...followUps] = effect.actions;
  if (!first || first.kind === "RawUnparsed" || first.optional !== true || first.abortOnDecline === true) return false;
  return followUps.some((action) => !cannotResolve(ctx, action));
}
