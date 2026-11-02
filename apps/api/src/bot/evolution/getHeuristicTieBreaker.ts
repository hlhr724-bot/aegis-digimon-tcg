import type { Feature } from "#api/bot/evolution/heuristic";
import type { TrainingWindow } from "#api/bot/training/policy";

type Params = { window: TrainingWindow; features: Record<Feature, number> };

export function getHeuristicTieBreaker({ window, features }: Params): number {
  if (window.kind === "orderCards" || window.kind === "counter") {
    return features.sourceValue;
  }
  if (
    window.kind !== "selectCards" &&
    window.kind !== "chooseTargets" &&
    window.kind !== "chooseOption" &&
    window.kind !== "orderTriggers"
  ) {
    return 0;
  }
  return (
    features.selectionGain -
    features.selectionLoss +
    10 * features.selectionRookie +
    features.selectionDuplicate * 0.5 +
    features.decisionMemory * 2 +
    features.decisionDraw * 2 +
    features.decisionRecovery * 4 +
    features.decisionRemoval * 4 +
    features.decisionPlay * 3 +
    features.decisionEvolution * 3 +
    features.decisionUnsuspend * 4 -
    features.decisionCost
  );
}
