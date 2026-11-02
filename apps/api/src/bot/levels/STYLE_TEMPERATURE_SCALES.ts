import { BotStyle } from "@aegis/shared/bot/BotStyle";

export const STYLE_TEMPERATURE_SCALES = {
  [BotStyle.BALANCED.value]: 1,
  [BotStyle.AGGRESSIVE.value]: 5,
  [BotStyle.DEFENSIVE.value]: 0.5,
} as const satisfies Record<BotStyle, number>;
