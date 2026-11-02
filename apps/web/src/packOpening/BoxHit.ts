export const BoxHit = {
  RARE: { name: "RARE", value: "R" },
  SUPER_RARE: { name: "SUPER_RARE", value: "SR" },
  ULTRA_RARE: { name: "ULTRA_RARE", value: "UR" },
  SECRET_RARE: { name: "SECRET_RARE", value: "SEC" },
  ALTERNATE_ART: { name: "ALTERNATE_ART", value: "AA" },
} as const;

export type BoxHit = (typeof BoxHit)[keyof typeof BoxHit]["value"];
