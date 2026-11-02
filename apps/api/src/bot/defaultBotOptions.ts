import type { Seat } from "@aegis/shared/schema/enums";
import type { GameEngine } from "#api/engine/GameEngine";
import type { BotOptions } from "#api/bot/BotPlayer";
import { defaultBotProgram, type DefaultBotDeck } from "#api/bot/defaultBotProgram";
import { createResidualPolicy } from "#api/bot/evolution/residualPolicy";
import { DEFAULT_BOT_PROFILE, resolveBotProfile } from "#api/bot/profiles";
import { createProjectedEvaluationPolicy } from "#api/bot/projectedPolicy";
import { mainActionReady } from "#api/bot/training/actions";

export function defaultBotOptions(input: {
  engine: GameEngine;
  seat: Seat;
  deck?: DefaultBotDeck;
  options?: BotOptions;
}): BotOptions {
  if (input.options?.policy !== undefined) return input.options;
  const profile = resolveBotProfile(input.options?.profile);
  const { program, specialized } = defaultBotProgram({ deck: input.deck });
  const seed = input.options?.seed ?? input.engine.hooks.seed + input.seat * 7919;
  const policy =
    profile === DEFAULT_BOT_PROFILE
      ? createResidualPolicy({ engine: input.engine, seat: input.seat, seed, program })
      : createProjectedEvaluationPolicy({ engine: input.engine, seat: input.seat, seed, profile });
  return {
    ...input.options,
    seed,
    policy:
      profile === DEFAULT_BOT_PROFILE
        ? { ...policy, name: `${specialized ? "validated-pilot" : "certified"}:${program.title}` }
        : policy,
    canChooseMainAction: input.options?.canChooseMainAction ?? (() => mainActionReady(input.engine)),
  };
}
