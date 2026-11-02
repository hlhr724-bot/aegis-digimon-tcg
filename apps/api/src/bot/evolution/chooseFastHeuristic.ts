import { getHeuristicTieBreaker } from "#api/bot/evolution/getHeuristicTieBreaker";
import type { TrainingWindow } from "#api/bot/training/policy";
import { actionCardId, actionFeatures, chooseHeuristic, type HeuristicProgram } from "#api/bot/evolution/heuristic";
import { createHeuristicFeatureContext } from "#api/bot/evolution/createHeuristicFeatureContext";
import { scoreFastHeuristic } from "#api/bot/evolution/scoreFastHeuristic";
import { createBotRandom } from "#api/bot/rng";

export function chooseFastHeuristic(program: HeuristicProgram, window: TrainingWindow, seed = 0): number {
  if (window.actions.length === 0) throw new Error("No legal heuristic action");
  const context = createHeuristicFeatureContext(window);
  let bestScore: number | undefined;
  let bestSecondary = Number.NEGATIVE_INFINITY;
  let tied: number[] = [];
  for (let index = 0; index < window.actions.length; index++) {
    const features = actionFeatures(window, index, context);
    const cardId = actionCardId(window, index, context);
    const score = scoreFastHeuristic(program, features, window.kind, cardId, window.observation);
    if (Number.isNaN(score)) return chooseHeuristic(program, window, seed);
    const secondary = getHeuristicTieBreaker({ window, features });
    if (bestScore === undefined || score > bestScore || (score === bestScore && secondary > bestSecondary)) {
      bestScore = score;
      bestSecondary = secondary;
      tied = [index];
    } else if (score === bestScore && secondary === bestSecondary) {
      tied.push(index);
    }
  }
  if (tied.length === 0) throw new Error("No legal heuristic action");
  if (tied.length === 1) return tied[0]!;
  let publicSeed = seed >>> 0;
  for (const character of JSON.stringify(window))
    publicSeed = Math.imul(publicSeed ^ character.charCodeAt(0), 16777619) >>> 0;
  return tied[Math.floor(createBotRandom(publicSeed).next() * tied.length)]!;
}
