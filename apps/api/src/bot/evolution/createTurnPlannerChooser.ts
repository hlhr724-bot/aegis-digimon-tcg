import { chooseHeuristic, type HeuristicProgram } from "#api/bot/evolution/heuristic";
import {
  defaultTurnPlannerParameters,
  type TurnPlannerParameters,
} from "#api/bot/evolution/defaultTurnPlannerParameters";
import { planMainTurn } from "#api/bot/evolution/planMainTurn";
import type { ChooseTrainingAction } from "#api/bot/training/policy";

export function createTurnPlannerChooser(input: {
  program: HeuristicProgram;
  seed?: number;
  parameters?: TurnPlannerParameters;
}): ChooseTrainingAction {
  const parameters = input.parameters ?? defaultTurnPlannerParameters;
  return (window) =>
    window.kind === "main" && window.actions.length > 1
      ? planMainTurn({ program: input.program, window, parameters }).index
      : chooseHeuristic(input.program, window, input.seed ?? 0);
}
