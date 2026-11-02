import type { Feature, HeuristicProgram } from "#api/bot/evolution/heuristic";
import type { TrainingObservation } from "#api/bot/training/observation";
import { matchesHeuristicCondition } from "#api/bot/evolution/matchesHeuristicCondition";

export function scoreFastHeuristic(
  program: HeuristicProgram,
  features: Record<Feature, number>,
  kind: string,
  sourceCardId?: string,
  observation?: TrainingObservation,
): number {
  let score = 0;
  for (const rule of program.rules) {
    const condition = rule.when;
    const matches = matchesHeuristicCondition({ condition, features, kind, sourceCardId, observation });
    score += matches ? features[rule.feature] * rule.weight : 0;
  }
  return score;
}
