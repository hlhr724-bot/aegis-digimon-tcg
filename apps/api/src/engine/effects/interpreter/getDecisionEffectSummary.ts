import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { Cost } from "@aegis/shared/effects/ir/predicates/costs";
import type { DecisionEffectSummary } from "@aegis/shared/protocol/DecisionEffectSummary";
import { getActivationMemoryCost } from "#api/engine/effects/interpreter/getActivationMemoryCost";

interface GetDecisionEffectSummaryParams {
  actions: readonly Action[];
  cost?: Cost;
}

type SummaryCounts = { -readonly [Key in keyof Omit<DecisionEffectSummary, "memoryCost">]: DecisionEffectSummary[Key] };

const cache = new WeakMap<readonly Action[], DecisionEffectSummary>();

function getEmptyCounts(): SummaryCounts {
  return {
    memoryGain: 0,
    cardsDrawn: 0,
    cardsRecovered: 0,
    cardsReturnedFromTrash: 0,
    removal: 0,
    plays: 0,
    evolutions: 0,
    unsuspends: 0,
    uncertain: false,
  };
}

function getControllerSign(controller: string | undefined): number {
  if (controller === "opponent") {
    return -1;
  }
  return controller === "both" ? 0 : 1;
}

const OWN_SECURITY_PLACEMENTS: ReadonlySet<string> = new Set([
  "placeAsSecurity",
  "addTop",
  "addBottom",
  "addTopOrBottom",
]);

function isOwnSecurityPlacement(action: Extract<Action, { kind: "SecurityManipulation" }>): boolean {
  return (
    OWN_SECURITY_PLACEMENTS.has(action.op) &&
    action.controller === "mine" &&
    action.ownerSecurity !== true &&
    action.bothPlayers !== true &&
    typeof action.source === "object"
  );
}

function getCounts(actions: readonly Action[], depth: number, budget: { remaining: number }): SummaryCounts {
  const result = getEmptyCounts();
  const add = (values: SummaryCounts): void => {
    for (const key of [
      "memoryGain",
      "cardsDrawn",
      "cardsRecovered",
      "cardsReturnedFromTrash",
      "removal",
      "plays",
      "evolutions",
      "unsuspends",
    ] as const) {
      result[key] += values[key];
    }
    result.uncertain ||= values.uncertain;
  };
  for (const action of actions) {
    if (depth > 12 || budget.remaining-- <= 0) {
      result.uncertain = true;
      break;
    }
    result.uncertain ||=
      ("condition" in action && action.condition !== undefined) ||
      action.optional === true ||
      ("scaling" in action && action.scaling !== undefined);
    switch (action.kind) {
      case "GainMemory":
        if (action.at !== "endOfTurn") {
          result.memoryGain += Math.max(0, action.amount);
        }
        break;
      case "Draw":
        result.cardsDrawn += action.amount * getControllerSign(action.controller);
        result.uncertain ||= action.untilHandSize !== undefined;
        break;
      case "Recover":
        result.cardsRecovered += action.amount ?? 1;
        result.uncertain ||= action.untilSecurityCount !== undefined;
        break;
      case "Delete":
      case "DeDigivolve":
      case "Return": {
        const controller = action.target.filter.controller;
        const zone = action.target.filter.zone;
        const isBoard = zone === undefined || zone === "battleArea";
        const isLooseReturn =
          action.kind === "Return" && action.from !== undefined && !action.from.includes("battleArea");
        if (controller === "opponent" && isBoard && !isLooseReturn) {
          result.removal += typeof action.target.count === "number" ? action.target.count : 1;
        } else if (action.kind === "Return" && controller === "mine" && zone === "trash" && action.to === "hand") {
          result.cardsReturnedFromTrash += typeof action.target.count === "number" ? action.target.count : 1;
          result.uncertain = true;
        } else {
          result.uncertain = true;
        }
        break;
      }
      case "PlayWithoutCost":
      case "PlayMultiple":
      case "PlayPerLevel":
      case "PlayFromZone":
        result.plays += 1;
        break;
      case "PlayToken":
        result.plays += action.placedAs === "opponentDigimon" ? -1 : 1;
        break;
      case "Digivolve":
      case "DnaDigivolve":
        result.evolutions += 1;
        break;
      case "Unsuspend": {
        const filter = action.target.filter;
        const controller =
          filter.controller ??
          filter.controllerDefault ??
          (filter.isSelfRef === true || action.target.isSelf === true ? "mine" : undefined);
        if (controller === "any" || controller === undefined) {
          result.uncertain = true;
        } else {
          result.unsuspends += getControllerSign(controller);
        }
        break;
      }
      case "RevealAdd":
        result.uncertain = true;
        if (action.controller !== undefined && action.controller !== "mine") {
          break;
        }
        for (const slot of action.add) {
          const count = typeof slot.count === "number" ? slot.count : 1;
          if (slot.to === undefined || slot.to === "hand") {
            result.cardsDrawn += count;
          } else if (slot.to === "play") {
            result.plays += count;
          }
        }
        break;
      case "SearchSecurity":
        result.plays += 1;
        result.cardsRecovered -= 1;
        break;
      case "SecurityManipulation":
        if (isOwnSecurityPlacement(action)) {
          result.cardsRecovered +=
            typeof action.source === "object" && typeof action.source.count === "number" ? action.source.count : 1;
        } else {
          result.uncertain = true;
        }
        break;
      case "CostGatedBlock":
        add(getCounts(action.actions, depth + 1, budget));
        break;
      case "ConditionalBranch":
        result.uncertain = true;
        break;
      case "Modal":
      case "RepeatPerCount":
      case "RawUnparsed":
      case "ActivateForeignEffect":
      case "UseOptionWithoutCost":
        result.uncertain = true;
        break;
      case "SubTrigger":
      case "Replacement":
      case "DelayedEffect":
      case "GainEffect":
      case "GainTriggeredEffect":
        break;
      default:
        result.uncertain = true;
    }
  }
  return result;
}

export function getDecisionEffectSummary({ actions, cost }: GetDecisionEffectSummaryParams): DecisionEffectSummary {
  const cached = cache.get(actions);
  if (cached !== undefined && cost === undefined) {
    return cached;
  }
  const counts = getCounts(actions, 0, { remaining: 128 });
  const output = {
    ...counts,
    memoryCost: getActivationMemoryCost({
      effect: { trigger: "Main", actions: [...actions], ...(cost === undefined ? {} : { cost }) },
    }),
  };
  for (const key of [
    "memoryGain",
    "cardsDrawn",
    "cardsRecovered",
    "cardsReturnedFromTrash",
    "removal",
    "plays",
    "evolutions",
    "unsuspends",
  ] as const) {
    if (!Number.isFinite(output[key])) {
      output[key] = 0;
      output.uncertain = true;
    }
    output[key] = Math.max(-64, Math.min(64, output[key]));
  }
  output.uncertain ||= output.memoryCost.maximum === null;
  const summary = Object.freeze(output);
  if (cost === undefined) {
    cache.set(actions, summary);
  }
  return summary;
}
