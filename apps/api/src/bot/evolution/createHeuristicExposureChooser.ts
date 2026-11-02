import { isDeepStrictEqual } from "node:util";
import {
  actionCardId,
  actionFeatures,
  chooseHeuristic,
  scoreHeuristicRules,
  type HeuristicProgram,
} from "#api/bot/evolution/heuristic";
import type { TrainingWindow } from "#api/bot/training/policy";

export type ExposureDecision = { window: TrainingWindow; candidate: number; baseline: number };

type Params = {
  program: HeuristicProgram;
  baseline: HeuristicProgram;
  seed: number;
  onDecision?: (decision: ExposureDecision) => void;
};

export function createHeuristicExposureChooser({ program, baseline, seed, onDecision }: Params) {
  const remaining = [...baseline.rules];
  const additions = program.rules.filter((rule) => {
    const index = remaining.findIndex((existing) => isDeepStrictEqual(existing, rule));
    if (index < 0) {
      return true;
    }
    remaining.splice(index, 1);
    return false;
  });
  const addedProgram = { ...program, rules: additions };
  const report = { decisions: 0, main: 0, triggered: 0, changed: 0 };
  function choose(window: TrainingWindow) {
    const index = chooseHeuristic(program, window, seed);
    const original = chooseHeuristic(baseline, window, seed);
    const triggered = window.actions.some((_, action) =>
      scoreHeuristicRules(
        addedProgram,
        actionFeatures(window, action),
        window.kind,
        actionCardId(window, action),
        window.observation,
      ).contributions.some((rule) => rule.value !== 0),
    );
    report.decisions += 1;
    report.main += Number(window.kind === "main");
    report.triggered += Number(triggered);
    report.changed += Number(index !== original);
    onDecision?.({ window, candidate: index, baseline: original });
    return index;
  }
  return { choose, report };
}
