import type { BotDifficulty } from "@aegis/shared/bot/BotDifficulty";
import type { BotStyle } from "@aegis/shared/bot/BotStyle";
import { BOT_LEVEL_CONFIGS, type LevelStyleOverride } from "#api/bot/levels/BOT_LEVEL_CONFIGS";
import { STYLE_TEMPERATURE_SCALES } from "#api/bot/levels/STYLE_TEMPERATURE_SCALES";
import type { WeightScales } from "#api/bot/levels/weakenWeights";

type Params = {
  difficulty: BotDifficulty;
  style: BotStyle;
};

export type ResolvedLevelConfig = {
  temperature: number;
  topK: number;
  weightScales: WeightScales;
  usesResidual: boolean;
  usesTurnPlanner: boolean;
  searchSimulations: number;
  searchCandidateLimit: number;
  searchBudgetMs: number;
  searchStyle: BotStyle;
  minThinkMs: number;
  maxThinkMs: number;
};

export function resolveLevelConfig({ difficulty, style }: Params): ResolvedLevelConfig {
  const { styleOverrides, ...config } = BOT_LEVEL_CONFIGS[difficulty];
  const overrides: Readonly<Partial<Record<BotStyle, LevelStyleOverride>>> = styleOverrides;
  const override = overrides[style] ?? {};
  return {
    ...config,
    temperature: override.temperature ?? config.temperature * STYLE_TEMPERATURE_SCALES[style],
    weightScales: { ...config.weightScales, ...override.weightScales },
    searchSimulations: override.searchSimulations ?? config.searchSimulations,
    searchCandidateLimit: override.searchCandidateLimit ?? config.searchCandidateLimit,
    searchStyle: override.searchStyle ?? style,
  };
}
