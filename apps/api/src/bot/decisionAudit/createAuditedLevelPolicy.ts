import type { Seat } from "@aegis/shared/schema/enums";
import type { BotDifficulty } from "@aegis/shared/bot/BotDifficulty";
import type { BotStyle } from "@aegis/shared/bot/BotStyle";
import type { DecisionAnswerObservation } from "#api/bot/decisions/DecisionAnswerObservation";
import { defaultBotProgram, type DefaultBotDeck } from "#api/bot/defaultBotProgram";
import { createResidualPolicy } from "#api/bot/evolution/residualPolicy";
import { humanPanelProgram } from "#api/bot/experiment/humanPanelProgram";
import { BOT_LEVEL_CONFIGS } from "#api/bot/levels/BOT_LEVEL_CONFIGS";
import { createStyledPlannerParameters } from "#api/bot/levels/createStyledPlannerParameters";
import { createLevelProfile } from "#api/bot/levels/createLevelProfile";
import { levelTemperature } from "#api/bot/levels/levelTemperature";
import { createEvaluationPolicy, type BotPolicy } from "#api/bot/policy";
import type { GameEngine } from "#api/engine/GameEngine";

type Params = {
  difficulty: BotDifficulty;
  style: BotStyle;
  engine: GameEngine;
  seat: Seat;
  deck: DefaultBotDeck;
  seed: number;
  onDecisionAnswer: (observation: DecisionAnswerObservation) => void;
};

export function createAuditedLevelPolicy({
  difficulty,
  style,
  engine,
  seat,
  deck,
  seed,
  onDecisionAnswer,
}: Params): BotPolicy {
  const config = BOT_LEVEL_CONFIGS[difficulty];
  const profile = createLevelProfile({ difficulty, style });
  if (!config.usesResidual) {
    return createEvaluationPolicy({
      profile,
      seed,
      temperature: levelTemperature({ difficulty, style }),
      topK: config.topK,
      onDecisionAnswer,
    });
  }
  return createResidualPolicy({
    engine,
    seat,
    seed,
    profile,
    program: defaultBotProgram({ deck }).program,
    onDecisionAnswer,
    ...(config.usesTurnPlanner
      ? { planner: createStyledPlannerParameters({ parameters: humanPanelProgram.planner, profile }) }
      : {}),
  });
}
