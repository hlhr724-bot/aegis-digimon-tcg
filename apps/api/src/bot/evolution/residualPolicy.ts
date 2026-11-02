import { createStyledHeuristicProgram } from "#api/bot/levels/createStyledHeuristicProgram";
import type { Seat } from "@aegis/shared";
import type { GameEngine } from "../../engine/GameEngine.js";
import type { Candidate } from "../candidates.js";
import { createProjectedEvaluationPolicy } from "../projectedPolicy.js";
import type { BotView } from "../view.js";
import { trainingObservation } from "../training/observation.js";
import type { TrainingAction } from "../training/actions.js";
import { actionCardId, actionFeatures, scoreHeuristicRules, type HeuristicProgram } from "./heuristic.js";
import { DEFAULT_BOT_PROFILE, type BotProfile } from "#api/bot/profiles";
import { planMainTurn } from "#api/bot/evolution/planMainTurn";
import type { TurnPlannerParameters } from "#api/bot/evolution/defaultTurnPlannerParameters";
import { humanPanelProgram } from "#api/bot/experiment/humanPanelProgram";
import { mainActions } from "#api/bot/training/actions";
import type { DecisionAnswerObservation } from "#api/bot/decisions/DecisionAnswerObservation";

/** Start with exactly the certified balanced policy; evolve bounded score adjustments. */
export const SEED_RESIDUAL: HeuristicProgram = {
  schemaVersion: 1,
  basePolicy: "projected-balanced",
  title: "Balanced decisions with learned situational preferences",
  rules: [
    "cost",
    "handover",
    "attackPlayer",
    "attackWinningBattle",
    "attackLosingBattle",
    "digivolve",
    "breedingGrowth",
    "levelGain",
    "dpGain",
    "playBody",
    "playTamer",
    "playOption",
    "pass",
    "activate",
    "materials",
    "sourceDp",
    "securityChecks",
    "readyAttackers",
  ].map((feature) => ({
    feature: feature as HeuristicProgram["rules"][number]["feature"],
    weight: 0,
    advice: "Use the balanced evaluation until a situational preference is demonstrated.",
  })),
};

export function createResidualPolicy(input: {
  engine: GameEngine;
  seat: Seat;
  seed: number;
  program: HeuristicProgram;
  onDecision?: (trace: unknown) => void;
  onDecisionAnswer?: (observation: DecisionAnswerObservation) => void;
  profile?: BotProfile;
  planner?: TurnPlannerParameters;
}) {
  if (input.program.basePolicy !== "projected-balanced") throw new Error("Residual policy needs the balanced base");
  const profile = input.profile ?? DEFAULT_BOT_PROFILE;
  let plannedIntent: string | undefined;
  let lastView: BotView | undefined;
  let observation: ReturnType<typeof trainingObservation>;
  let entries: {
    key: string;
    score: number;
    action: TrainingAction;
    features: ReturnType<typeof actionFeatures>;
    sourceCardId?: string;
    contributions: ReturnType<typeof scoreHeuristicRules>["contributions"];
  }[] = [];
  return createProjectedEvaluationPolicy({
    engine: input.engine,
    seat: input.seat,
    seed: input.seed,
    profile,
    preferBeneficialSelections: input.program.preferBeneficialSelections,
    preferFreeOptionSelections: input.program.preferFreeOptionSelections,
    onDecisionAnswer: input.onDecisionAnswer,
    ...(input.profile !== undefined || input.program.breedingDeployLevel === undefined
      ? {}
      : {
          profile: {
            ...profile,
            weights: { ...profile.weights, deployLevel: input.program.breedingDeployLevel },
          },
        }),
    adjustMainScore({ view, candidate, action, score }) {
      if (lastView !== view) {
        lastView = view;
        observation = trainingObservation(input.engine.state, input.seat);
        entries = [];
        plannedIntent = undefined;
        if (input.planner !== undefined) {
          const actions = mainActions(input.engine, input.seat, {
            includeSpecialActions: false,
            digiXrosValidationBudget: 256,
          });
          if (actions.length > 0) {
            const plan = planMainTurn({
              program: createStyledHeuristicProgram({ program: humanPanelProgram.program, profile }),
              window: { observation, kind: "main", selected: [], actions },
              parameters: input.planner,
            });
            plannedIntent = JSON.stringify(actions[plan.index]?.intent);
          }
        }
      }
      const window = { observation, kind: "main", selected: [], actions: [action] };
      const features = actionFeatures(window, 0);
      features.baselineScore = score;
      features.securityChecks =
        candidate.kind === "attackPlayer" ? Math.max(0, candidate.attacker?.securityAttack ?? 1) : 0;
      features.readyAttackers = view.readyAttackers.length;
      const sourceCardId = actionCardId(window, 0);
      const adjustment = scoreHeuristicRules(input.program, features, "main", sourceCardId, observation);
      if (input.onDecision)
        entries.push({
          key: candidate.key,
          score: score + adjustment.score,
          action,
          features,
          sourceCardId,
          contributions: adjustment.contributions,
        });
      return adjustment.score + (plannedIntent === JSON.stringify(action.intent) ? 2 : 0);
    },
    onMainChoice(candidate: Candidate | undefined) {
      if (!input.onDecision) return;
      const ranked = [...entries].sort((a, b) => b.score - a.score);
      const chosen = candidate ? entries.find((entry) => entry.key === candidate.key) : undefined;
      input.onDecision({
        kind: "main",
        turn: observation.turn,
        action: chosen?.action ?? { intent: { type: "endPhase" }, label: "Pass below action threshold" },
        sourceCardId: chosen?.sourceCardId,
        features: chosen?.features,
        score: chosen?.score,
        legalActions: entries.length,
        topScoreTies: ranked.filter((entry) => entry.score === ranked[0]?.score).length,
        scoreTies: chosen ? ranked.filter((entry) => entry.score === chosen.score).length : 0,
        reasons: chosen?.contributions.filter((rule) => rule.value !== 0) ?? [],
        alternatives: ranked
          .filter((entry) => entry !== chosen)
          .slice(0, 3)
          .map(({ action, features, score, sourceCardId }) => ({ action, features, score, sourceCardId })),
      });
    },
  });
}
