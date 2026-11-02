import type { BotDifficulty } from "@aegis/shared/bot/BotDifficulty";
import type { BotStyle } from "@aegis/shared/bot/BotStyle";
import { resolveLevelConfig } from "#api/bot/levels/resolveLevelConfig";

type Params = {
  difficulty: BotDifficulty;
  style: BotStyle;
};

export function levelTemperature({ difficulty, style }: Params): number {
  return resolveLevelConfig({ difficulty, style }).temperature;
}
