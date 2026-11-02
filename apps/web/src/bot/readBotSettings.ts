import { BotDifficulty } from "@aegis/shared/bot/BotDifficulty";
import { BotStyle } from "@aegis/shared/bot/BotStyle";
import type { BotSettings } from "@aegis/shared/bot/BotSettings";
import { isBotDifficulty } from "@aegis/shared/bot/isBotDifficulty";
import { isBotStyle } from "@aegis/shared/bot/isBotStyle";

export function readBotSettings(): BotSettings {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem("aegis.botSettings") ?? "null");
    if (
      typeof stored === "object" &&
      stored !== null &&
      "botDifficulty" in stored &&
      "botStyle" in stored &&
      isBotDifficulty(stored.botDifficulty) &&
      isBotStyle(stored.botStyle)
    ) {
      return { botDifficulty: stored.botDifficulty, botStyle: stored.botStyle };
    }
  } catch {}
  return { botDifficulty: BotDifficulty.STANDARD.value, botStyle: BotStyle.BALANCED.value };
}
