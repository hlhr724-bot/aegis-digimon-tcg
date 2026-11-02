import type { BotDifficulty } from "@aegis/shared/bot/BotDifficulty";
import type { BotStyle } from "@aegis/shared/bot/BotStyle";
import { resolveLevelConfig } from "#api/bot/levels/resolveLevelConfig";
import { weakenWeights } from "#api/bot/levels/weakenWeights";
import { BOT_PROFILES, type BotProfile } from "#api/bot/profiles";

type Params = {
  difficulty: BotDifficulty;
  style: BotStyle;
};

export function createLevelProfile({ difficulty, style }: Params): BotProfile {
  const scales = resolveLevelConfig({ difficulty, style }).weightScales;
  const profile = BOT_PROFILES[style];
  if (Object.keys(scales).length === 0) {
    return profile;
  }
  return { ...profile, weights: weakenWeights({ weights: profile.weights, scales }) };
}
