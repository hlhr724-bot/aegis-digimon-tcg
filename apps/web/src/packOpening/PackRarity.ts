export const PackRarity = {
  COMMON: { name: "COMMON", value: "C", fallback: undefined, glowColor: undefined, label: "Common" },
  UNCOMMON: { name: "UNCOMMON", value: "U", fallback: "C", glowColor: undefined, label: "Uncommon" },
  RARE: { name: "RARE", value: "R", fallback: "U", glowColor: "#4aa8ff", label: "Rare" },
  SUPER_RARE: { name: "SUPER_RARE", value: "SR", fallback: "R", glowColor: "#ffc94a", label: "Super Rare" },
  ULTRA_RARE: { name: "ULTRA_RARE", value: "UR", fallback: "SR", glowColor: "#ff8a3d", label: "Ultimate Rare" },
  SECRET_RARE: { name: "SECRET_RARE", value: "SEC", fallback: "SR", glowColor: "#ff4fd8", label: "Secret Rare" },
} as const;

export type PackRarity = (typeof PackRarity)[keyof typeof PackRarity]["value"];
