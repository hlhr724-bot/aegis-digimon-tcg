import { CardFinish } from "@/design/webglCard/CardFinish";

export const PackRarity = {
  COMMON: { name: "COMMON", value: "C", fallback: undefined, glowColor: undefined, label: "Common" },
  UNCOMMON: { name: "UNCOMMON", value: "U", fallback: "C", glowColor: undefined, label: "Uncommon" },
  RARE: { name: "RARE", value: "R", fallback: "U", glowColor: CardFinish.HOLO.glowColor, label: "Rare" },
  SUPER_RARE: {
    name: "SUPER_RARE",
    value: "SR",
    fallback: "R",
    glowColor: CardFinish.STARLIGHT.glowColor,
    label: "Super Rare",
  },
  ULTRA_RARE: {
    name: "ULTRA_RARE",
    value: "UR",
    fallback: "SR",
    glowColor: CardFinish.GOLD.glowColor,
    label: "Ultimate Rare",
  },
  SECRET_RARE: {
    name: "SECRET_RARE",
    value: "SEC",
    fallback: "SR",
    glowColor: CardFinish.PRISMATIC.glowColor,
    label: "Secret Rare",
  },
} as const;

export type PackRarity = (typeof PackRarity)[keyof typeof PackRarity]["value"];
