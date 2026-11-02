import type { CardEffect } from "@aegis/shared/effects/ir/card";

type Params = { effect: CardEffect };

export function canCancelOptionalActivation({ effect }: Params): boolean {
  const action = effect.actions[0];
  if (
    !action ||
    action.kind === "RawUnparsed" ||
    effect.cost ||
    (effect.optional !== true && !(action.optional === true && action.abortOnDecline === true))
  ) {
    return false;
  }
  if (
    action.kind !== "Suspend" &&
    action.kind !== "Unsuspend" &&
    action.kind !== "ModifyDP" &&
    action.kind !== "Delete" &&
    action.kind !== "Return"
  ) {
    return false;
  }
  if (
    action.cost ||
    action.additionalCost ||
    action.additionalCosts?.length ||
    action.costOptions?.length ||
    action.scaling
  ) {
    return false;
  }
  if (
    action.kind === "Delete" &&
    (action.at ||
      action.additionalSimultaneousTargets?.length ||
      action.dpCeilingScaling ||
      action.totalDpCapScaling ||
      action.playCostCeiling)
  ) {
    return false;
  }
  if (action.kind === "Return" && action.from !== undefined) {
    return false;
  }
  const target = action.target;
  return (
    target.count !== "all" &&
    target.chooser !== "opponent" &&
    !target.isSelf &&
    !target.filter.isSelfRef &&
    !target.sameTarget &&
    !target.sourceRef &&
    !target.fromSelectionRef &&
    !target.filter.boundRef &&
    !target.filter.zone &&
    !target.orFilters?.length
  );
}
