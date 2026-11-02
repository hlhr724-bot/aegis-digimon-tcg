import { BotDifficulty } from "@aegis/shared/bot/BotDifficulty";
import { BotStyle } from "@aegis/shared/bot/BotStyle";
import type { WeightScales } from "#api/bot/levels/weakenWeights";

export type LevelStyleOverride = {
  temperature?: number;
  weightScales?: WeightScales;
  searchSimulations?: number;
  searchCandidateLimit?: number;
  searchStyle?: BotStyle;
};

type LevelConfig = {
  temperature: number;
  topK: number;
  weightScales: WeightScales;
  usesResidual: boolean;
  usesTurnPlanner: boolean;
  searchSimulations: number;
  searchCandidateLimit: number;
  searchBudgetMs: number;
  minThinkMs: number;
  maxThinkMs: number;
  styleOverrides: Readonly<Partial<Record<BotStyle, LevelStyleOverride>>>;
};

export const BOT_LEVEL_CONFIGS = {
  [BotDifficulty.BEGINNER.value]: {
    temperature: 5,
    topK: 5,
    weightScales: { memoryHandover: 0.5, crossZero: 0.5, crossZeroPerReadyAttacker: 0.5 },
    usesResidual: false,
    usesTurnPlanner: false,
    searchSimulations: 0,
    searchCandidateLimit: 0,
    searchBudgetMs: 0,
    minThinkMs: 800,
    maxThinkMs: 1600,
    styleOverrides: {
      [BotStyle.DEFENSIVE.value]: {
        weightScales: { memoryHandover: 1, crossZero: 1, crossZeroPerReadyAttacker: 1 },
      },
    },
  },
  [BotDifficulty.CASUAL.value]: {
    temperature: 2.5,
    topK: 4,
    weightScales: {},
    usesResidual: false,
    usesTurnPlanner: false,
    searchSimulations: 0,
    searchCandidateLimit: 0,
    searchBudgetMs: 0,
    minThinkMs: 1200,
    maxThinkMs: 2200,
    styleOverrides: {
      [BotStyle.DEFENSIVE.value]: { temperature: 0.9 },
    },
  },
  [BotDifficulty.STANDARD.value]: {
    temperature: 0,
    topK: 1,
    weightScales: { removal: 0.75, loss: 0.75 },
    usesResidual: false,
    usesTurnPlanner: false,
    searchSimulations: 0,
    searchCandidateLimit: 0,
    searchBudgetMs: 0,
    minThinkMs: 2000,
    maxThinkMs: 2800,
    styleOverrides: {
      [BotStyle.AGGRESSIVE.value]: { weightScales: { removal: 1, loss: 1, securityAttack: 0.8 } },
    },
  },
  [BotDifficulty.EXPERT.value]: {
    temperature: 0,
    topK: 1,
    weightScales: {},
    usesResidual: true,
    usesTurnPlanner: false,
    searchSimulations: 3,
    searchCandidateLimit: 3,
    searchBudgetMs: 900,
    minThinkMs: 2000,
    maxThinkMs: 2800,
    styleOverrides: {
      [BotStyle.AGGRESSIVE.value]: { weightScales: { securityAttack: 0.8 } },
      [BotStyle.DEFENSIVE.value]: { weightScales: { removal: 0.75, loss: 0.75 } },
    },
  },
  [BotDifficulty.MASTER.value]: {
    temperature: 0,
    topK: 1,
    weightScales: {},
    usesResidual: true,
    usesTurnPlanner: true,
    searchSimulations: 20,
    searchCandidateLimit: 8,
    searchBudgetMs: 1_450,
    minThinkMs: 2000,
    maxThinkMs: 2800,
    styleOverrides: {
      [BotStyle.AGGRESSIVE.value]: { weightScales: { securityAttack: 0.8 } },
      [BotStyle.DEFENSIVE.value]: { weightScales: { removal: 0.75, loss: 0.75 } },
    },
  },
} as const satisfies Record<BotDifficulty, LevelConfig>;
