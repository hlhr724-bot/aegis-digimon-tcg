import { BotDifficulty } from "#shared/bot/BotDifficulty";

export function isBotDifficulty(value: unknown): value is BotDifficulty {
  return typeof value === "string" && Object.values(BotDifficulty).some((entry) => entry.value === value);
}
