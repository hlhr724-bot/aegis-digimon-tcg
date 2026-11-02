import { Phase, type Intent, type ServerEvent } from "@aegis/shared";
import { createSeenOpponentCardsTracker } from "#api/bot/evolution/createSeenOpponentCardsTracker";
import type { BotDifficulty } from "@aegis/shared/bot/BotDifficulty";
import type { BotStyle } from "@aegis/shared/bot/BotStyle";
import type { Seat } from "@aegis/shared/schema/enums";
import type { BotOptions } from "#api/bot/BotPlayer";
import type { BotPolicy } from "#api/bot/policy";
import { defaultBotProgram, type DefaultBotDeck } from "#api/bot/defaultBotProgram";
import { createResidualPolicy } from "#api/bot/evolution/residualPolicy";
import { humanPanelProgram } from "#api/bot/experiment/humanPanelProgram";
import { createLiveSearchPolicy } from "#api/bot/search/createLiveSearchPolicy";
import { resolveLevelConfig } from "#api/bot/levels/resolveLevelConfig";
import { createStyledPlannerParameters } from "#api/bot/levels/createStyledPlannerParameters";
import { createLevelProfile } from "#api/bot/levels/createLevelProfile";
import { LEVEL_SEARCH_POLICY_TIMEOUT_MS } from "#api/bot/levels/LEVEL_SEARCH_POLICY_TIMEOUT_MS";
import type { LevelSearchTiming } from "#api/bot/levels/LevelSearchTiming";
import { createEvaluationPolicy } from "#api/bot/policy";
import { breedingActions, mainActions, mainActionReady } from "#api/bot/training/actions";
import type { GameEngine } from "#api/engine/GameEngine";

type Params = {
  difficulty: BotDifficulty;
  style: BotStyle;
  engine: GameEngine;
  seat: Seat;
  deck: DefaultBotDeck;
  seed: number;
  searchTiming?: LevelSearchTiming;
};

export function createLevelBotOptions({
  difficulty,
  style,
  engine,
  seat,
  deck,
  seed,
  searchTiming,
}: Params): BotOptions {
  const config = resolveLevelConfig({ difficulty, style });
  const profile = createLevelProfile({ difficulty, style });
  const seenCards = createSeenOpponentCardsTracker({ observer: seat });
  const program = defaultBotProgram({ deck }).program;
  const standardPolicy: BotPolicy<Intent | Promise<Intent>> = createEvaluationPolicy({
    profile,
    seed,
    temperature: 0,
    topK: 1,
  });
  const residualPolicy: BotPolicy<Intent | Promise<Intent>> = createResidualPolicy({
    engine,
    seat,
    seed,
    profile,
    program,
    ...(config.usesTurnPlanner
      ? {
          planner: createStyledPlannerParameters({ parameters: humanPanelProgram.planner, profile }),
        }
      : {}),
  });
  const configuredPolicy: BotPolicy<Intent | Promise<Intent>> = createEvaluationPolicy({
    profile,
    seed,
    temperature: config.temperature,
    topK: config.topK,
  });
  function withSeenCards(basePolicy: BotPolicy<Intent | Promise<Intent>>) {
    return {
      ...basePolicy,
      observeEvent(event: ServerEvent) {
        basePolicy.observeEvent?.(event);
        seenCards.observeEvent(event);
      },
      getSeenOpponentCards: seenCards.snapshot,
    };
  }
  const seenConfiguredPolicy = withSeenCards(configuredPolicy);
  const seenStandardPolicy = withSeenCards(standardPolicy);
  const seenResidualPolicy = withSeenCards(residualPolicy);
  const policy =
    config.searchSimulations > 0
      ? createLiveSearchPolicy({
          engine,
          seat,
          policy: config.usesResidual ? seenResidualPolicy : seenStandardPolicy,
          fallbackPolicy: seenStandardPolicy,
          profile,
          searchProfile: createLevelProfile({ difficulty, style: config.searchStyle }),
          program,
          seed,
          simulations: config.searchSimulations,
          candidateLimit: config.searchCandidateLimit,
          maxDurationMs: searchTiming?.searchBudgetMs ?? config.searchBudgetMs,
          ...(searchTiming === undefined ? {} : { decisionDeadlineMs: searchTiming.decisionDeadlineMs }),
          getSeenOpponentCards: seenCards.snapshot,
        })
      : config.usesResidual
        ? seenResidualPolicy
        : seenConfiguredPolicy;
  return {
    difficulty,
    profile,
    seed,
    policy: { ...policy, name: `level:${difficulty}:${style}:${policy.name}` },
    ...(config.searchSimulations === 0
      ? {}
      : { policyTimeoutMs: searchTiming?.policyTimeoutMs ?? LEVEL_SEARCH_POLICY_TIMEOUT_MS }),
    minThinkMs: config.minThinkMs,
    maxThinkMs: config.maxThinkMs,
    canChooseMainAction: () => mainActionReady(engine),
    getLegalCandidateCount: () =>
      engine.state.phase === Phase.Breeding
        ? breedingActions(engine, seat).length
        : mainActions(engine, seat, { includeSpecialActions: true, digiXrosValidationBudget: 256 }).length,
  };
}
