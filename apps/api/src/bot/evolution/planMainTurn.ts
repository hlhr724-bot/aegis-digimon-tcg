import { actionCardId, actionFeatures, type HeuristicProgram } from "#api/bot/evolution/heuristic";
import { applyPlannedAction } from "#api/bot/evolution/applyPlannedAction";
import { createHeuristicFeatureContext } from "#api/bot/evolution/createHeuristicFeatureContext";
import { createPlannedTurnState, type PlannedTurnState } from "#api/bot/evolution/createPlannedTurnState";
import type { TurnPlannerParameters } from "#api/bot/evolution/defaultTurnPlannerParameters";
import { scoreFastHeuristic } from "#api/bot/evolution/scoreFastHeuristic";
import { scorePlannedTurnEnd } from "#api/bot/evolution/scorePlannedTurnEnd";
import type { TrainingWindow } from "#api/bot/training/policy";

export interface PlannedMainTurn {
  index: number;
  value: number;
  sequence: number[];
}

interface PlanNode {
  state: PlannedTurnState;
  value: number;
  first?: number;
  firstAdvantage: number;
  applied: string[];
  sequence: number[];
}

const ROLLOUT_LIMIT = 40;
const BRANCHING_LIMIT = 16;

export function planMainTurn(input: {
  program: HeuristicProgram;
  window: TrainingWindow;
  parameters: TurnPlannerParameters;
}): PlannedMainTurn {
  const { program, window, parameters } = input;
  if (window.actions.length === 0) throw new Error("No legal main-phase action");
  const weights = parameters.weights;
  let best: PlannedMainTurn | undefined;
  let bestFirstAdvantage = Number.NEGATIVE_INFINITY;
  const consider = (node: PlanNode, value: number, sequence: number[]): void => {
    const index = node.first!;
    if (
      best === undefined ||
      value > best.value ||
      (value === best.value &&
        (node.firstAdvantage > bestFirstAdvantage ||
          (node.firstAdvantage === bestFirstAdvantage && index < best.index)))
    ) {
      best = { index, value, sequence };
      bestFirstAdvantage = node.firstAdvantage;
    }
  };
  const advantages = (state: PlannedTurnState): number[] => {
    const scoringWindow: TrainingWindow = {
      observation: state.observation,
      kind: window.kind,
      selected: [],
      actions: state.actions,
    };
    const context = createHeuristicFeatureContext(scoringWindow);
    const scores = state.actions.map((_, index) =>
      scoreFastHeuristic(
        program,
        actionFeatures(scoringWindow, index, context),
        scoringWindow.kind,
        actionCardId(scoringWindow, index, context),
        scoringWindow.observation,
      ),
    );
    const pass = state.actions.findIndex((action) => action.intent.type === "endPhase");
    const baseline = pass < 0 ? 0 : scores[pass]!;
    return scores.map((score, index) => (index === pass ? 0 : score - baseline));
  };
  const step = (node: PlanNode, index: number, advantage: number): PlanNode => {
    const action = node.state.actions[index]!;
    return {
      state: applyPlannedAction(node.state, index),
      value: node.value + advantage,
      first: node.first ?? index,
      firstAdvantage: node.first === undefined ? advantage : node.firstAdvantage,
      applied: [...node.applied, JSON.stringify(action.intent)],
      sequence: [...node.sequence, index],
    };
  };
  const finish = (node: PlanNode): void =>
    consider(node, node.value + scorePlannedTurnEnd(node.state, weights), node.sequence);
  let beam: PlanNode[] = [
    { state: createPlannedTurnState(window), value: 0, firstAdvantage: 0, applied: [], sequence: [] },
  ];
  for (let depth = 0; depth < parameters.depth && beam.length > 0; depth++) {
    const children = new Map<string, { node: PlanNode; estimate: number }>();
    for (const node of beam) {
      const scored = advantages(node.state);
      const expanded = scored
        .map((advantage, index) => ({ advantage, index }))
        .sort((left, right) => right.advantage - left.advantage || left.index - right.index)
        .slice(0, BRANCHING_LIMIT);
      for (const { index } of expanded) {
        const child = step(node, index, scored[index]!);
        if (child.state.ended) {
          finish(child);
          continue;
        }
        const key = [...child.applied].sort().join("\n");
        const estimate = child.value + scorePlannedTurnEnd(child.state, weights);
        const existing = children.get(key);
        if (existing === undefined || estimate > existing.estimate) children.set(key, { node: child, estimate });
      }
    }
    beam = [...children.values()]
      .sort((left, right) => right.estimate - left.estimate)
      .slice(0, Math.max(1, parameters.beam))
      .map((entry) => entry.node);
  }
  for (const leaf of beam) {
    let node = leaf;
    for (let steps = 0; !node.state.ended && node.state.actions.length > 0 && steps < ROLLOUT_LIMIT; steps++) {
      const scored = advantages(node.state);
      let choice = 0;
      for (let index = 1; index < scored.length; index++) if (scored[index]! > scored[choice]!) choice = index;
      node = step(node, choice, scored[choice]!);
    }
    finish(node);
  }
  return best!;
}
