import type { Action } from "@aegis/shared/effects/ir/actions/action";
import { DecisionSelectionGoal } from "@aegis/shared/protocol/DecisionSelectionGoal";

interface GetDecisionSelectionGoalParams {
  action: Action;
}

export function getDecisionSelectionGoal({
  action,
}: GetDecisionSelectionGoalParams): DecisionSelectionGoal | undefined {
  switch (action.kind) {
    case "Trash":
    case "HandManipulation":
      return DecisionSelectionGoal.DISCARD.value;
    case "PlayWithoutCost":
    case "PlayMultiple":
    case "PlayPerLevel":
    case "PlayFromZone":
    case "SearchSecurity":
      return DecisionSelectionGoal.PLAY.value;
    case "Digivolve":
    case "DnaDigivolve":
      return DecisionSelectionGoal.EVOLVE.value;
    case "Return":
      if ((action.target.filter.controller ?? action.target.filter.controllerDefault) !== "mine") {
        return undefined;
      }
      if (
        action.to === "hand" &&
        ((action.from !== undefined && action.from.length > 0 && action.from.every((zone) => zone === "trash")) ||
          action.target.filter.zone === "trash")
      ) {
        return DecisionSelectionGoal.GAIN.value;
      }
      return undefined;
    case "RevealAdd": {
      const destinations = new Set(
        action.add.flatMap((slot) => [slot.to ?? "hand", ...(slot.orDispositions ?? []).map((entry) => entry.to)]),
      );
      if (destinations.size !== 1) {
        return undefined;
      }
      if (destinations.has("hand")) {
        return DecisionSelectionGoal.GAIN.value;
      }
      if (destinations.has("play")) {
        return DecisionSelectionGoal.PLAY.value;
      }
      return undefined;
    }
    default:
      return undefined;
  }
}
