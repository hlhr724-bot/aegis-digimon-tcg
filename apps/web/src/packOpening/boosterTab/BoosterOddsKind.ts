export const BoosterOddsKind = {
  COMMON: { name: "COMMON", value: "C", labelKey: "redesign.collection.booster.rarity.common" },
  UNCOMMON: { name: "UNCOMMON", value: "U", labelKey: "redesign.collection.booster.rarity.uncommon" },
  RARE: { name: "RARE", value: "R", labelKey: "redesign.collection.booster.rarity.rare" },
  SUPER_RARE: { name: "SUPER_RARE", value: "SR", labelKey: "redesign.collection.booster.rarity.superRare" },
  ULTRA_RARE: { name: "ULTRA_RARE", value: "UR", labelKey: "redesign.collection.booster.rarity.ultimateRare" },
  SECRET_RARE: { name: "SECRET_RARE", value: "SEC", labelKey: "redesign.collection.booster.rarity.secretRare" },
  ALTERNATE_ART: { name: "ALTERNATE_ART", value: "AA", labelKey: "redesign.collection.booster.alternateArt" },
} as const;

export type BoosterOddsKind = (typeof BoosterOddsKind)[keyof typeof BoosterOddsKind]["value"];
