import { BotStyle } from "#shared/bot/BotStyle";

export function isBotStyle(value: unknown): value is BotStyle {
  return typeof value === "string" && Object.values(BotStyle).some((entry) => entry.value === value);
}
