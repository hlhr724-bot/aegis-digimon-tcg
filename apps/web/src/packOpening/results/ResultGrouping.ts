export const ResultGrouping = {
  PACK: { name: "PACK", value: "pack", label: "Pack" },
  RARITY: { name: "RARITY", value: "rarity", label: "Rarity" },
  NONE: { name: "NONE", value: "none", label: "None" },
} as const;

export type ResultGrouping = (typeof ResultGrouping)[keyof typeof ResultGrouping]["value"];
