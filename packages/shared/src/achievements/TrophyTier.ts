export const TrophyTier = {
  BRONZE: { name: "BRONZE", value: "bronze", rank: 1 },
  SILVER: { name: "SILVER", value: "silver", rank: 2 },
  GOLD: { name: "GOLD", value: "gold", rank: 3 },
  RAINBOW: { name: "RAINBOW", value: "rainbow", rank: 4 },
} as const;

export type TrophyTier = (typeof TrophyTier)[keyof typeof TrophyTier]["value"];
