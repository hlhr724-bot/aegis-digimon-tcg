import type { TrainingWindow } from "#api/bot/training/policy";
import { actionCardId, actionFeatures, type HeuristicProgram } from "#api/bot/evolution/heuristic";
import { createHeuristicFeatureContext } from "#api/bot/evolution/createHeuristicFeatureContext";
import { scoreFastHeuristic } from "#api/bot/evolution/scoreFastHeuristic";

type Params = { window: TrainingWindow; program: HeuristicProgram };

export function orderMctsActions(input: Params): TrainingWindow {
  if (input.program.basePolicy !== undefined) {
    throw new Error("MCTS ordering requires a standalone heuristic program");
  }
  if (input.window.actions.length < 2) {
    return input.window;
  }
  const context = createHeuristicFeatureContext(input.window);
  const alternatives = input.window.actions.slice(1).map((action, index) => {
    const features = actionFeatures(input.window, index + 1, context);
    const cardId = actionCardId(input.window, index + 1, context);
    const score = scoreFastHeuristic(input.program, features, input.window.kind, cardId, input.window.observation);
    if (!Number.isFinite(score)) {
      throw new Error("MCTS ordering produced a non-finite score");
    }
    return { action, index, score };
  });
  alternatives.sort((left, right) => right.score - left.score || left.index - right.index);
  return { ...input.window, actions: [input.window.actions[0]!, ...alternatives.map(({ action }) => action)] };
}
