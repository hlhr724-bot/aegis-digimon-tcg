export const ManualPanel = {
  CARDS: { name: "CARDS", value: "cards", label: "manual.cardsTab" },
  PILES: { name: "PILES", value: "piles", label: "manual.pilesTab" },
  TURN: { name: "TURN", value: "turn", label: "manual.turnTab" },
  MATCH: { name: "MATCH", value: "match", label: "manual.matchTab" },
} as const;

export type ManualPanel = (typeof ManualPanel)[keyof typeof ManualPanel]["value"];
