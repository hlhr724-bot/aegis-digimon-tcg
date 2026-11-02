import { isAllowedTargetSelection } from "@/game/screen/model/isAllowedTargetSelection";
import { playCostBudgetAllowsCandidate } from "../../overlay/choice/decisionPlayCost";
import { dpBudgetAllowsCandidate } from "../../overlay/choice/decisionDpBudget";
import { differentColorsAllowCandidate, distinctCardIdsAllow, distinctNamesAllow } from "../../decisionModel";

// CR 4-24-2: a multicolor card only needs one color no other pick uses, so the
// picks stay legal as long as a distinct color can still be assigned to each.
export function decisionAllowsPick(input: {
  decisionSelectable: ReadonlySet<string>;
  instanceId: string;
  picks: readonly string[];
  decisionInstanceColors: ReadonlyMap<string, readonly string[]>;
  decisionDifferentColors: boolean;
  decisionVisibleCardIds: ReadonlyMap<string, string | undefined>;
  decisionDistinctCardIds: boolean;
  decisionDistinctNames?: boolean;
  decisionAllowedTargetCombinations?: readonly (readonly string[])[];
  decisionMaxTotalPlayCost?: number;
  decisionMaxTotalDP?: number;
  decisionCandidateDP?: ReadonlyMap<string, number>;
  decisionMax?: number;
}): boolean {
  const {
    decisionSelectable,
    instanceId,
    picks,
    decisionInstanceColors,
    decisionDifferentColors,
    decisionVisibleCardIds,
    decisionDistinctCardIds,
    decisionDistinctNames,
    decisionAllowedTargetCombinations,
    decisionMaxTotalPlayCost,
    decisionMaxTotalDP,
    decisionCandidateDP,
    decisionMax,
  } = input;
  return (
    decisionSelectable.has(instanceId) &&
    !multiPickLimitReached({ picks, instanceId, max: decisionMax }) &&
    (picks.includes(instanceId) ||
      isAllowedTargetSelection({
        allowedTargetCombinations: decisionAllowedTargetCombinations,
        picks: [...picks, instanceId],
      })) &&
    differentColorsAllowCandidate(instanceId, picks, decisionInstanceColors, decisionDifferentColors) &&
    distinctCardIdsAllow(instanceId, picks, decisionVisibleCardIds, decisionDistinctCardIds) &&
    distinctNamesAllow(instanceId, picks, decisionVisibleCardIds, decisionDistinctNames === true) &&
    playCostBudgetAllowsCandidate({
      candidateInstanceId: instanceId,
      picks,
      candidates: Array.from(decisionVisibleCardIds, ([id, cardId]) => ({ instanceId: id, cardId })),
      maxTotalPlayCost: decisionMaxTotalPlayCost,
    }) &&
    dpBudgetAllowsCandidate({
      candidateInstanceId: instanceId,
      picks,
      maxTotalDP: decisionMaxTotalDP,
      dpOf: (id) => decisionCandidateDP?.get(id),
    })
  );
}

export function nextDecisionPicks(input: { picks: readonly string[]; instanceId: string; max: number }): string[] {
  const { picks, instanceId, max } = input;
  if (picks.includes(instanceId)) return picks.filter((id) => id !== instanceId);
  if (max <= 1) return [instanceId];
  if (multiPickLimitReached({ picks, instanceId, max })) return [...picks];
  return [...picks, instanceId];
}

function multiPickLimitReached(input: { picks: readonly string[]; instanceId: string; max: number | undefined }) {
  const { picks, instanceId, max } = input;
  return max !== undefined && max > 1 && !picks.includes(instanceId) && picks.length >= max;
}
