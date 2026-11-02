export const CardMovePosition = {
  DECK_TOP: { name: "DECK_TOP", value: "deckTop" },
  DECK_BOTTOM: { name: "DECK_BOTTOM", value: "deckBottom" },
  DIGIVOLUTION_CARDS: { name: "DIGIVOLUTION_CARDS", value: "digivolutionCards" },
  LINKED_CARDS: { name: "LINKED_CARDS", value: "linkedCards" },
  UNDER_TAMER: { name: "UNDER_TAMER", value: "underTamer" },
  RESOLVING_OPTION: { name: "RESOLVING_OPTION", value: "resolvingOption" },
  SUSPENDED: { name: "SUSPENDED", value: "suspended" },
  UNSUSPENDED: { name: "UNSUSPENDED", value: "unsuspended" },
  VARIOUS: { name: "VARIOUS", value: "various" },
} as const;

export type CardMovePosition = (typeof CardMovePosition)[keyof typeof CardMovePosition]["value"];
