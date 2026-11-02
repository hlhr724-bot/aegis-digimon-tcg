import { BotReference } from "#api/bot/levels/BotReference";

export function isBotReference(value: unknown): value is BotReference {
  return typeof value === "string" && Object.values(BotReference).some((entry) => entry.value === value);
}
