import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CardEffect } from "@aegis/shared/effects/ir/card";
import type { Cost } from "@aegis/shared/effects/ir/predicates/costs";
import type { ActivationMemoryCost } from "#api/engine/effects/ActivationMemoryCost";

interface GetActivationMemoryCostParams {
  effect: CardEffect;
}

interface ProjectionContext {
  remaining: number;
}

interface GetCostParams {
  cost: Cost | undefined;
  context: ProjectionContext;
  depth: number;
}

interface GetActionParams {
  action: Action;
  context: ProjectionContext;
  depth: number;
}

interface GetSequenceParams {
  actions: readonly Action[];
  context: ProjectionContext;
  depth: number;
}

const FREE: ActivationMemoryCost = Object.freeze({ minimum: 0, maximum: 0 });
const UNKNOWN: ActivationMemoryCost = Object.freeze({ minimum: 0, maximum: null });

function addCosts(costs: readonly ActivationMemoryCost[]): ActivationMemoryCost {
  const minimum = costs.reduce((sum, cost) => sum + cost.minimum, 0);
  const maximum = costs.some((cost) => cost.maximum === null)
    ? null
    : costs.reduce((sum, cost) => sum + (cost.maximum ?? 0), 0);
  if (!Number.isFinite(minimum) || (maximum !== null && !Number.isFinite(maximum))) {
    return UNKNOWN;
  }
  return { minimum, maximum };
}

function chooseCost(costs: readonly ActivationMemoryCost[]): ActivationMemoryCost {
  if (costs.length === 0) {
    return FREE;
  }
  return {
    minimum: Math.min(...costs.map((cost) => cost.minimum)),
    maximum: costs.some((cost) => cost.maximum === null) ? null : Math.max(...costs.map((cost) => cost.maximum ?? 0)),
  };
}

function allowSkippedCost(cost: ActivationMemoryCost): ActivationMemoryCost {
  return { minimum: 0, maximum: cost.maximum };
}

function getFixedCost(amount: number): ActivationMemoryCost {
  if (!Number.isFinite(amount)) {
    return UNKNOWN;
  }
  const cost = Math.max(0, amount);
  return { minimum: cost, maximum: cost };
}

function getCost({ cost, context, depth }: GetCostParams): ActivationMemoryCost {
  if (cost === undefined) {
    return FREE;
  }
  if (depth > 16 || context.remaining-- <= 0) {
    return UNKNOWN;
  }
  let result: ActivationMemoryCost;
  switch (cost.kind) {
    case "payMemory":
      result = getFixedCost(cost.memory ?? 0);
      break;
    case "compound":
      result = allowSkippedCost(
        addCosts((cost.costs ?? []).map((nested) => getCost({ cost: nested, context, depth: depth + 1 }))),
      );
      break;
    case "raw":
    case "digivolve":
    case "digivolveSelf":
    case "playFromDigivolutionCards":
    case "attack":
      result = UNKNOWN;
      break;
    case "trash":
    case "suspend":
    case "unsuspend":
    case "unsuspendNamed":
    case "return":
    case "place":
    case "placeOwnTopAtStackBottom":
    case "deleteOwn":
    case "trashBreeding":
    case "flipSecurity":
    case "trashSecurityTop":
    case "trashBothSecurityTop":
    case "trashBottomFaceDownUnderTamer":
    case "trashBottomFaceDownUnderDigimon":
    case "securityToHand":
    case "placeAsSecurity":
    case "reveal":
    case "moveToBattleArea":
      result = FREE;
      break;
    default:
      result = UNKNOWN;
  }
  return cost.optional === true ? allowSkippedCost(result) : result;
}

function getSequence({ actions, context, depth }: GetSequenceParams): ActivationMemoryCost {
  const result = addCosts(actions.map((action) => getAction({ action, context, depth: depth + 1 })));
  return actions.length > 1 ? allowSkippedCost(result) : result;
}

function getPayload({ action, context, depth }: GetActionParams): ActivationMemoryCost {
  switch (action.kind) {
    case "GainMemory":
      if (action.at === "endOfTurn" || action.amount >= 0) {
        return FREE;
      }
      return action.scaling === undefined ? getFixedCost(-action.amount) : UNKNOWN;
    case "PayMemoryUpTo":
      return allowSkippedCost(getFixedCost(action.maxMemory));
    case "SetMemory":
      return UNKNOWN;
    case "CostGatedBlock":
      return getSequence({ actions: action.actions, context, depth });
    case "ConditionalBranch":
      return chooseCost([
        getSequence({ actions: action.ifTrue, context, depth }),
        getSequence({ actions: action.ifFalse ?? [], context, depth }),
      ]);
    case "Modal": {
      const choices = action.options.map((actions) => getSequence({ actions, context, depth }));
      if (action.choose === 1 && action.chooseScaling === undefined && action.chooseAll === undefined) {
        return chooseCost(choices);
      }
      return allowSkippedCost(addCosts(choices));
    }
    case "RepeatPerCount": {
      const repeated = getAction({ action: action.action, context, depth: depth + 1 });
      return repeated.maximum === 0 ? FREE : UNKNOWN;
    }
    case "SecurityManipulation":
      return chooseCost([
        getSequence({ actions: action.ifAddedToHand ?? [], context, depth }),
        getSequence({ actions: action.ifNotAddedToHand ?? [], context, depth }),
      ]);
    case "RevealAdd":
      return action.add.some((slot) =>
        [slot.to, ...(slot.orDispositions ?? []).map((disposition) => disposition.to)].some(
          (destination) => destination === "useOption" || (destination === "play" && slot.costDelta !== undefined),
        ),
      )
        ? UNKNOWN
        : FREE;
    case "Digivolve":
      if (action.payCost === false) {
        return FREE;
      }
      return UNKNOWN;
    case "PlayWithoutCost":
      return action.payCost || action.chooseDualMode === true ? UNKNOWN : FREE;
    case "PlayMultiple":
    case "PlayPerLevel":
    case "DnaDigivolve":
      return action.payCost ? UNKNOWN : FREE;
    case "PlayFromZone":
      return action.payCost === false ? FREE : UNKNOWN;
    case "CostModifier":
      return FREE;
    case "Draw":
    case "Delete":
    case "DeletePerColor":
    case "DeleteUntilCount":
    case "DeleteBudget":
    case "DeleteByStackColorBudget":
    case "RevealChooseDeleteBudget":
    case "DeleteLevelBudget":
    case "DeleteByDPBudget":
    case "AddToDPDeleteBudget":
    case "Trash":
    case "OpponentMayTrashSecurity":
    case "HandManipulation":
    case "Return":
    case "ReturnToEggDeck":
    case "ReturnTopDigivolutionCards":
    case "TrashTopStackedCards":
    case "Suspend":
    case "Unsuspend":
    case "MovePermanent":
    case "Hatch":
    case "ModifyDP":
    case "AddDPFromTrashedCard":
    case "AddDPFromSuspendedCost":
    case "SetBaseDP":
    case "GainKeyword":
    case "GainTriggeredEffect":
    case "GainEffect":
    case "DelayedEffect":
    case "GrantAuraToOpponents":
    case "DynamicDigivolutionNames":
    case "DigiXrosMaterialZoneExpansion":
    case "AllowDigiXrosMaterialsFromTrash":
    case "HandRevealAdd":
    case "Look":
    case "Reveal":
    case "Search":
    case "SearchSecurity":
    case "DeDigivolve":
    case "TamerOntoDigivolve":
    case "PlaceUnder":
    case "TrashDigivolution":
    case "GrantLinkCostReduction":
    case "CannotIgnoreDigivolutionRequirements":
    case "AddToHandSelf":
    case "PlaceInBattleAreaSelf":
    case "TrashTopDeck":
    case "RedirectAttack":
    case "SelectBind":
    case "Restrict":
    case "DeclareCategoryImmunity":
    case "RestrictUnsuspendedDigivolve":
    case "GrantCanAttackUnsuspended":
    case "GrantVortexCanAttackPlayers":
    case "EndAttack":
    case "ArmSuspendRestriction":
    case "SecurityAttackInvert":
    case "RestrictDigivolveInto":
    case "MinDpFloor":
    case "StackTrashLock":
    case "DelayedDeletePlayed":
    case "DelayedDelete":
    case "Aura":
    case "GrantStatic":
    case "GrantImmunity":
    case "WaiveColorRequirement":
    case "ModifySecurityDP":
    case "DeletionMaxDpModifier":
    case "RecoverByTrashingMostSecurity":
    case "Recover":
    case "trashSecurityTop":
    case "RestrictMemoryGain":
    case "RestrictCostReduction":
    case "RestrictPlay":
    case "GlobalRestrict":
    case "DisableSecurityEffect":
    case "DisableTimingEffect":
    case "WinGame":
    case "SetTurnEndMemory":
      return FREE;
    default:
      return UNKNOWN;
  }
}

function getAction({ action, context, depth }: GetActionParams): ActivationMemoryCost {
  if (depth > 16 || context.remaining-- <= 0) {
    return UNKNOWN;
  }
  if (action.kind === "SubTrigger" || action.kind === "Replacement") {
    return FREE;
  }
  const cost = action.cost;
  const options = action.kind === "RawUnparsed" || action.kind === "CostModifier" ? [] : (action.costOptions ?? []);
  let base = FREE;
  if (options.length === 0) {
    base = typeof cost === "number" ? UNKNOWN : getCost({ cost, context, depth });
  }
  const extra =
    action.kind === "RawUnparsed"
      ? FREE
      : addCosts([
          getCost({ cost: action.additionalCost, context, depth }),
          ...(action.additionalCosts ?? []).map((nested) => getCost({ cost: nested, context, depth })),
        ]);
  const alternatives =
    action.kind === "RawUnparsed"
      ? FREE
      : chooseCost(options.map((nested) => getCost({ cost: nested, context, depth })));
  const result = addCosts([base, extra, alternatives, getPayload({ action, context, depth })]);
  return action.optional === true || action.condition !== undefined ? allowSkippedCost(result) : result;
}

export function getActivationMemoryCost({ effect }: GetActivationMemoryCostParams): ActivationMemoryCost {
  const context = { remaining: 256 };
  const result = addCosts([
    getCost({ cost: effect.cost, context, depth: 0 }),
    getSequence({ actions: effect.actions, context, depth: 0 }),
  ]);
  return Object.freeze(effect.optional === true ? allowSkippedCost(result) : result);
}
