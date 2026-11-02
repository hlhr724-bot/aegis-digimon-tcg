import type { Intent, Seat } from "@aegis/shared";
import type { GameEngine } from "#api/engine/GameEngine";
import { trainingObservation } from "#api/bot/training/observation";
import { createTrainingPolicy, type TrainingWindow } from "#api/bot/training/policy";
import { CombatSearchKind } from "#api/bot/search/CombatSearchKind";
import type { CombatSearchRequest } from "#api/bot/search/CombatSearchRequest";

type Params = { engine: GameEngine; seat: Seat; baseline: Intent; request: CombatSearchRequest };

const BASELINE_PRIOR_WEIGHT = 1.5;

export function createCombatRootWindow({
  engine,
  seat,
  baseline,
  request,
}: Params): { root: TrainingWindow; priors: number[] } | undefined {
  let captured: TrainingWindow | undefined;
  const capture = createTrainingPolicy(engine, seat, (window) => {
    captured ??= window;
    return 0;
  });
  if (request.kind === CombatSearchKind.BLOCK.value) {
    capture.chooseBlockResponse(request.view, request.context);
  } else {
    capture.chooseCounterResponse(request.view, request.context);
  }
  if (captured === undefined || captured.actions.length < 2) {
    return undefined;
  }
  const baselineKey = JSON.stringify(baseline);
  const baselineIndex = captured.actions.findIndex((action) => JSON.stringify(action.intent) === baselineKey);
  if (baselineIndex < 0) {
    return undefined;
  }
  const root: TrainingWindow = {
    observation: trainingObservation(engine.state, seat),
    kind: captured.kind,
    selected: [],
    actions: captured.actions,
    ...(captured.combat === undefined ? {} : { combat: captured.combat }),
  };
  const weights = captured.actions.map((_, index) => (index === baselineIndex ? BASELINE_PRIOR_WEIGHT : 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return { root, priors: weights.map((weight) => weight / total) };
}
