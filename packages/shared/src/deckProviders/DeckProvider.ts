export const DeckProvider = {
  DIGILAB: {
    value: "digilab",
    name: "DigiLab",
    url: "https://digilab.cards",
    profileExample: "https://digimon.digilab.cards/tamer/…",
  },
} as const;
export type DeckProviderId = (typeof DeckProvider)[keyof typeof DeckProvider]["value"];
