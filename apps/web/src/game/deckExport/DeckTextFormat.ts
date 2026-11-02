export const DeckTextFormat = {
  DIGIMON_CARD_IO: { name: "DIGIMON_CARD_IO", value: "digimoncard-io", label: "DigimonCard.io" },
  TCGPLAYER: { name: "TCGPLAYER", value: "tcgplayer", label: "TCGplayer" },
} as const;

export type DeckTextFormat = (typeof DeckTextFormat)[keyof typeof DeckTextFormat]["value"];
