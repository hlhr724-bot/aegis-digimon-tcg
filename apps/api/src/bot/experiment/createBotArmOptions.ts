import { createStyledPlannerParameters } from "#api/bot/levels/createStyledPlannerParameters";
import { BotStyle } from "@aegis/shared/bot/BotStyle";
import { BotDifficulty } from "@aegis/shared/bot/BotDifficulty";
import { createStyledHeuristicProgram } from "#api/bot/levels/createStyledHeuristicProgram";
import type { BotProfile } from "#api/bot/profiles";
import type { Seat } from "@aegis/shared/schema/enums";
import type { BotOptions } from "#api/bot/BotPlayer";
import { defaultBotProgram, type DefaultBotDeck } from "#api/bot/defaultBotProgram";
import { createResidualPolicy } from "#api/bot/evolution/residualPolicy";
import { createEvaluationPolicy } from "#api/bot/policy";
import { resolveBotProfile } from "#api/bot/profiles";
import { createTurnPlannerChooser } from "#api/bot/evolution/createTurnPlannerChooser";
import { chooseHeuristic } from "#api/bot/evolution/heuristic";
import { BotArm } from "#api/bot/experiment/BotArm";
import { createFallbackBotPolicy } from "#api/bot/experiment/createFallbackBotPolicy";
import { humanPanelProgram } from "#api/bot/experiment/humanPanelProgram";
import { mainActionReady } from "#api/bot/training/actions";
import { createAsyncTrainingPolicy, type ChooseTrainingAction } from "#api/bot/training/policy";
import type { GameEngine } from "#api/engine/GameEngine";

interface CreateBotArmOptionsParams {
  arm: BotArm;
  engine: GameEngine;
  seat: Seat;
  deck: DefaultBotDeck;
  onFallback: () => void;
  style?: BotStyle;
}

const CANDIDATE_TIMEOUT_MS = 1_000;

function createCandidateChooser(usesPlanner: boolean, seed: number, profile: BotProfile): ChooseTrainingAction {
  const program = createStyledHeuristicProgram({ program: humanPanelProgram.program, profile });
  const planner = createStyledPlannerParameters({ parameters: humanPanelProgram.planner, profile });
  if (usesPlanner) {
    return createTurnPlannerChooser({ program, seed, parameters: planner });
  }
  return (window) => chooseHeuristic(program, window, seed);
}

function findArmEntry(arm: BotArm) {
  const entry = Object.values(BotArm).find((candidate) => candidate.value === arm);
  if (entry === undefined) {
    throw new Error(`Unknown bot experiment arm: ${arm}`);
  }
  return entry;
}

export function createBotArmOptions({
  arm,
  engine,
  seat,
  deck,
  onFallback,
  style = BotStyle.BALANCED.value,
}: CreateBotArmOptionsParams): BotOptions | undefined {
  if (arm === BotArm.LEGACY.value) {
    return undefined;
  }
  const entry = findArmEntry(arm);
  if (!entry.usesCandidate) {
    const seed = engine.hooks.seed + seat * 7919;
    const profile = resolveBotProfile(style);
    const { program, specialized } = defaultBotProgram({ deck });
    const policy = createResidualPolicy({ engine, seat, seed, profile, program });
    return {
      difficulty: BotDifficulty.STANDARD.value,
      profile,
      seed,
      policy: { ...policy, name: `${specialized ? "validated-pilot" : "certified"}:${program.title}` },
      canChooseMainAction: () => mainActionReady(engine),
    };
  }
  const seed = engine.hooks.seed + seat * 7919;
  const standard = createEvaluationPolicy({ profile: resolveBotProfile(style), seed });
  const choose = createCandidateChooser(entry.usesPlanner, seed, resolveBotProfile(style));
  const candidate = createAsyncTrainingPolicy(engine, seat, async (window) => choose(window));
  return {
    seed,
    policy: createFallbackBotPolicy({
      name: `experiment:${arm}:${humanPanelProgram.program.title}`,
      candidate,
      standard,
      onFallback,
    }),
    canChooseMainAction: () => mainActionReady(engine),
    policyTimeoutMs: CANDIDATE_TIMEOUT_MS,
  };
}
