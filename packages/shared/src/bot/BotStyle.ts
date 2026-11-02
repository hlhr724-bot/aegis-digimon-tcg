export const BotStyle = {
  BALANCED: { name: "BALANCED", value: "balanced" },
  AGGRESSIVE: { name: "AGGRESSIVE", value: "aggressive" },
  DEFENSIVE: { name: "DEFENSIVE", value: "defensive" },
} as const;

export type BotStyle = (typeof BotStyle)[keyof typeof BotStyle]["value"];
