export const ResultSort = {
  PACK_ORDER: { name: "PACK_ORDER", value: "pack-order", label: "Pack order" },
  RARITY: { name: "RARITY", value: "rarity", label: "Rarity" },
  NAME: { name: "NAME", value: "name", label: "Name" },
  NUMBER: { name: "NUMBER", value: "number", label: "Card number" },
} as const;

export type ResultSort = (typeof ResultSort)[keyof typeof ResultSort]["value"];
