import { isDeepStrictEqual } from "node:util";
import { scoreHeuristicRules, type Feature, type HeuristicProgram } from "#api/bot/evolution/heuristic";
import type { TrainingObservation } from "#api/bot/training/observation";

type TeacherCase = {
  position: { hash: string };
  result: {
    valid: boolean;
    preferred?: boolean;
    difference?: number | null;
    baseline: number;
    alternative: number | null;
    context: {
      observation: TrainingObservation;
      actions: { index: number; label?: string; features: Record<Feature, number>; card?: { cardId: string } }[];
    };
  };
};

type Params = { program: HeuristicProgram; baseline: HeuristicProgram; cases: TeacherCase[] };

export function auditReplayTeacherAlignment({ program, baseline, cases }: Params) {
  const positions = cases
    .filter((entry) => entry.result.valid)
    .map((entry) => {
      const row = entry.result;
      const scores = row.context.actions.map((action) => {
        const args = [action.features, "main", action.card?.cardId, row.context.observation] as const;
        return {
          index: action.index,
          baseline: scoreHeuristicRules(baseline, ...args).score,
          candidate: scoreHeuristicRules(program, ...args).score,
        };
      });
      if (scores.length === 0 || scores.some((action) => !Number.isFinite(action.candidate))) {
        throw new Error("Teacher alignment needs finite legal action scores");
      }
      const baselineMaximum = Math.max(...scores.map((action) => action.baseline));
      if (!scores.some((action) => action.index === row.baseline && action.baseline === baselineMaximum)) {
        throw new Error("Teacher baseline score changed");
      }
      const candidateMaximum = Math.max(...scores.map((action) => action.candidate));
      const top = scores.filter((action) => action.candidate === candidateMaximum).map((action) => action.index);
      const alternative = row.context.actions.find((action) => action.index === row.alternative);
      const equivalentTamerCopies =
        alternative !== undefined &&
        alternative.card !== undefined &&
        alternative.features.playTamer === 1 &&
        alternative.features.sourceInHand === 1 &&
        top.every((index) => {
          const action = row.context.actions.find((item) => item.index === index);
          return (
            action?.card?.cardId === alternative.card?.cardId &&
            action?.label === alternative.label &&
            isDeepStrictEqual(action?.features, alternative.features)
          );
        });
      const aligned =
        top.includes(row.alternative ?? -1) &&
        row.alternative !== row.baseline &&
        !top.includes(row.baseline) &&
        (top.length === 1 || equivalentTamerCopies);
      return {
        hash: entry.position.hash,
        preferred: row.preferred === true,
        difference: row.difference,
        baseline: row.baseline,
        alternative: row.alternative,
        top,
        aligned,
        equivalentTamerCopies,
        baselineDisplaced: !top.includes(row.baseline),
        scores,
      };
    });
  const supported = positions.filter((row) => row.preferred && row.aligned).length;
  return { supported, eligible: supported > 0, positions };
}
