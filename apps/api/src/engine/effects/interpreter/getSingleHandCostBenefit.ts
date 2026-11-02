import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { Cost } from "@aegis/shared/effects/ir/predicates/costs";
import type { SingleHandCostBenefit } from "@aegis/shared/protocol/SingleHandCostBenefit";
import { paysProcessingCostBeforeOptional } from "#api/engine/effects/interpreter/paysProcessingCostBeforeOptional";

interface GetSingleHandCostBenefitParams {
  actions: readonly Action[];
  cost?: Cost;
}

const metadataKeys = new Set([
  "kind",
  "optional",
  "raw",
  "effectTextPart",
  "costTextEmphasis",
  "optionalTextEmphasis",
  "abortOnDecline",
  "preserveOncePerTurnOnDecline",
  "payCostBeforeOptional",
]);

function hasOnlyKeys(value: object, keys: ReadonlySet<string>): boolean {
  return Object.entries(value).every(([key, entry]) => entry === undefined || keys.has(key));
}

function isSingleHandCost(cost: Cost | undefined): boolean {
  const target = cost?.target;
  return (
    cost?.kind === "trash" &&
    cost.optional !== true &&
    target !== undefined &&
    hasOnlyKeys(cost, new Set(["kind", "target", "raw", "optional", "declineViaSelection"])) &&
    hasOnlyKeys(target, new Set(["filter", "count"])) &&
    target.count === 1 &&
    target.filter.controller === "mine" &&
    target.filter.zone === "hand"
  );
}

function getAmount(value: number | undefined): number | undefined {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0 && value <= 64 ? value : undefined;
}

export function getSingleHandCostBenefit({
  actions,
  cost,
}: GetSingleHandCostBenefitParams): SingleHandCostBenefit | undefined {
  if (actions.length === 0 || actions.length > 32) {
    return undefined;
  }
  let payment = cost;
  let body = actions;
  let paidAction: Action | undefined;
  const first = actions[0]!;
  if (cost === undefined) {
    if (
      actions.length !== 1 ||
      first.kind === "RawUnparsed" ||
      first.cost === undefined ||
      typeof first.cost === "number"
    ) {
      return undefined;
    }
    paidAction = first;
    payment = first.cost;
    if (paysProcessingCostBeforeOptional(first)) {
      return undefined;
    }
    if (first.kind === "CostGatedBlock") {
      if (!hasOnlyKeys(first, new Set([...metadataKeys, "cost", "actions"]))) {
        return undefined;
      }
      body = first.actions;
    }
  }
  if (!isSingleHandCost(payment) || body.length === 0 || body.length > 32) {
    return undefined;
  }
  let cardsDrawn = 0;
  let memoryGain = 0;
  let cardsRecovered = 0;
  for (const action of body) {
    if (action.kind === "RawUnparsed") {
      return undefined;
    }
    const isPayer = action === paidAction;
    const keys = new Set([...metadataKeys, "amount", ...(isPayer ? ["cost"] : [])]);
    if ((!isPayer && action.optional === true) || action.payCostBeforeOptional === true) {
      return undefined;
    }
    if (action.kind === "Draw") {
      keys.add("controller");
      if (action.controller !== "mine" || !hasOnlyKeys(action, keys)) {
        return undefined;
      }
      const amount = getAmount(action.amount);
      if (amount === undefined) {
        return undefined;
      }
      cardsDrawn += amount;
    } else if (action.kind === "GainMemory") {
      if (!hasOnlyKeys(action, keys)) {
        return undefined;
      }
      const amount = getAmount(action.amount);
      if (amount === undefined) {
        return undefined;
      }
      memoryGain += amount;
    } else if (action.kind === "Recover") {
      if (!hasOnlyKeys(action, keys)) {
        return undefined;
      }
      const amount = getAmount(action.amount ?? 1);
      if (amount === undefined) {
        return undefined;
      }
      cardsRecovered += amount;
    } else {
      return undefined;
    }
  }
  if (cardsDrawn + memoryGain + cardsRecovered === 0 || Math.max(cardsDrawn, memoryGain, cardsRecovered) > 64) {
    return undefined;
  }
  return Object.freeze({ cardsDrawn, memoryGain, cardsRecovered });
}
