export const RankedTier = {
  BRONZE: { name: "BRONZE", value: "bronze", minimum: 0 },
  SILVER: { name: "SILVER", value: "silver", minimum: 1000 },
  GOLD: { name: "GOLD", value: "gold", minimum: 1200 },
  PLATINUM: { name: "PLATINUM", value: "platinum", minimum: 1400 },
  DIAMOND: { name: "DIAMOND", value: "diamond", minimum: 1600 },
} as const;

export type RankedTier = (typeof RankedTier)[keyof typeof RankedTier]["value"];
