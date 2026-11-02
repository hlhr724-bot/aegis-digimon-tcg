import { printedPassage } from "#api/engine/decisions/printedPassage";
import type { EffectContext } from "../../EffectContext.js";
import { canPayCost, costIsAskedAsSelection } from "./canPay.js";
import { payCompoundCost } from "./compound.js";
import { payPlaceCost } from "./place.js";
import {
  payDeleteOwnCost,
  payDigivolveCost,
  payMoveToBattleAreaCost,
  paySuspendCost,
  payUnsuspendCost,
  payUnsuspendNamedCost,
} from "./permanents.js";
import { payMemoryCost, payRevealCost } from "./resources.js";
import { payReturnCost } from "./return.js";
import {
  payFlipSecurityCost,
  payPlaceAsSecurityCost,
  paySecurityToHandCost,
  payTrashBothSecurityTopCost,
  payTrashSecurityTopCost,
} from "./security.js";
import {
  payPlaceOwnTopAtStackBottomCost,
  payPlayFromDigivolutionCardsCost,
  payTrashBottomFaceDownCost,
  payTrashBreedingCost,
} from "./stacks.js";
import { payTrashCost } from "./trash.js";
import type { CostPayer } from "./types.js";
import type { Cost } from "@aegis/shared";

/**
 * One payer per cost kind. A kind absent here cannot be paid precisely yet, and
 * `payCost` fails it — the same answer the old switch's `default` gave.
 *
 * `attack` and `digivolveSelf` are deliberately absent: they are declaration
 * costs the action itself has already satisfied, never paid here.
 */
const PAYERS: Partial<Record<Cost["kind"], CostPayer>> = {
  moveToBattleArea: payMoveToBattleAreaCost,
  digivolve: payDigivolveCost,
  reveal: payRevealCost,
  compound: payCompoundCost,
  trashBreeding: payTrashBreedingCost,
  trashBottomFaceDownUnderTamer: payTrashBottomFaceDownCost,
  trashBottomFaceDownUnderDigimon: payTrashBottomFaceDownCost,
  suspend: paySuspendCost,
  unsuspend: payUnsuspendCost,
  unsuspendNamed: payUnsuspendNamedCost,
  trash: payTrashCost,
  return: payReturnCost,
  deleteOwn: payDeleteOwnCost,
  payMemory: payMemoryCost,
  flipSecurity: payFlipSecurityCost,
  trashSecurityTop: payTrashSecurityTopCost,
  trashBothSecurityTop: payTrashBothSecurityTopCost,
  securityToHand: paySecurityToHandCost,
  placeAsSecurity: payPlaceAsSecurityCost,
  placeOwnTopAtStackBottom: payPlaceOwnTopAtStackBottomCost,
  playFromDigivolutionCards: payPlayFromDigivolutionCardsCost,
  place: payPlaceCost,
};

export async function payCost(
  ctx: EffectContext,
  cost: Cost,
  out?: { paidCount: number },
  opts?: { deferSuspendTriggers?: boolean },
): Promise<boolean> {
  // Every decision raised below this point is a PAYMENT question, not a target choice.
  // `decisionApi` reads the depth back and tags the request `purpose: "cost"`, which is
  // the only thing that distinguishes "pick a card to trash as the cost" from "pick a
  // card to trash as the effect" for a seat answering without the printed text. Restored
  // in a `finally` so a throwing cost cannot leave the flag raised on a shared context.
  ctx.payingCostDepth = (ctx.payingCostDepth ?? 0) + 1;
  const outerEffectTextPart = ctx.activeEffectTextPart;
  const outerEffectTextEmphasis = ctx.activeEffectTextEmphasis;
  const outerTargetFate = ctx.activeTargetFate;
  ctx.activeTargetFate = cost.kind === "deleteOwn" ? "delete" : undefined;
  const printedCost =
    cost.raw !== undefined && ctx.activeEffectText !== undefined
      ? printedPassage(ctx.activeEffectText, cost.raw)
      : undefined;
  if (printedCost !== undefined) {
    ctx.activeEffectTextPart = ctx.activeEffectText;
    ctx.activeEffectTextEmphasis = printedCost;
  }
  try {
    const payer = PAYERS[cost.kind];
    if (payer !== undefined && !costIsAskedAsSelection(cost) && canPayCost(ctx, cost)) ctx.onActivationChosen?.();
    return payer === undefined ? false : await payer(ctx, cost, out, opts);
  } finally {
    ctx.payingCostDepth -= 1;
    ctx.activeEffectTextPart = outerEffectTextPart;
    ctx.activeEffectTextEmphasis = outerEffectTextEmphasis;
    ctx.activeTargetFate = outerTargetFate;
  }
}

export async function payOneCostOption(
  ctx: EffectContext,
  costs: readonly Cost[],
  out?: { paidCount: number },
): Promise<boolean> {
  if (costs.length === 0) return true;
  // Only a cost the player can actually pay is a choice; offering one that cannot be paid
  // charges nothing and silently cancels the effect (BT23-073 without a [Mother Eater]).
  const payable = costs.filter((cost) => canPayCost(ctx, cost));
  if (payable.length === 0) return false;
  const index =
    payable.length === 1
      ? 0
      : await ctx.ask.chooseOption(
          ctx,
          payable.map((cost) => cost.raw ?? cost.kind),
        );
  const cost = payable[index];
  if (cost === undefined) return false;
  return payCost(ctx, cost, out);
}
