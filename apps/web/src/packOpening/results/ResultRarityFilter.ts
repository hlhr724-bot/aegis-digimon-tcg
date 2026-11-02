export const ResultRarityFilter = {
  ALL: { name: "ALL", value: "all", label: "All rarities" },
  ALTERNATE_ART: { name: "ALTERNATE_ART", value: "aa", label: "Alternate art" },
} as const;

export type ResultRarityFilter = (typeof ResultRarityFilter)[keyof typeof ResultRarityFilter]["value"];
