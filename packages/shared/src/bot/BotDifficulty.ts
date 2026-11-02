export const BotDifficulty = {
  BEGINNER: { name: "BEGINNER", value: "beginner", order: 0 },
  CASUAL: { name: "CASUAL", value: "casual", order: 1 },
  STANDARD: { name: "STANDARD", value: "standard", order: 2 },
  EXPERT: { name: "EXPERT", value: "expert", order: 3 },
  MASTER: { name: "MASTER", value: "master", order: 4 },
} as const;

export type BotDifficulty = (typeof BotDifficulty)[keyof typeof BotDifficulty]["value"];
