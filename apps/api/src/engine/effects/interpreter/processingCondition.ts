import type { Action } from "@aegis/shared";
import { isPrintedByCondition } from "./isPrintedByCondition.js";

/**
 * §15-7-5: an optional `by [cost], [effect]` processing condition may pay its
 * condition even when the following effect currently has no legal target.
 * Generated IR preserves the printed `By ...` prefix on the cost, which is the
 * authoritative distinction from transactional "you may X; if you did" costs.
 * The explicit flag remains the compatibility escape hatch for handwritten IR
 * that cannot carry the printed wording.
 */
export function allowsOptionalProcessingCostWithoutTarget(action: Action): boolean {
  if (action.kind === "RawUnparsed") return false;
  if (action.allowCostWithoutTarget === true) return true;
  const printedByCondition =
    action.optional === true &&
    [action.cost, action.additionalCost, ...(action.additionalCosts ?? []), ...(action.costOptions ?? [])].some(
      isPrintedByCondition,
    );
  const placementSource =
    action.kind === "Delete" ? (action.cost?.kind === "place" ? action.cost.target?.from : undefined) : undefined;
  const hasLoosePlacementSource = Array.isArray(placementSource)
    ? placementSource.some((zone) => zone === "hand" || zone === "trash")
    : placementSource === "hand" || placementSource === "trash";
  return (
    printedByCondition ||
    (action.kind === "Delete" &&
      action.optional === true &&
      action.abortOnDecline === true &&
      action.cost?.kind === "place" &&
      action.cost.destination === "digivolutionStack" &&
      action.cost.host === "self" &&
      hasLoosePlacementSource)
  );
}
