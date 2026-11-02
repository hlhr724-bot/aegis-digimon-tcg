export const ArenaInputRegion = {
  HAND: { name: "HAND", value: "hand" },
  BREEDING: { name: "BREEDING", value: "breeding" },
  VIEWER_FIELD: { name: "VIEWER_FIELD", value: "viewerField" },
  OPPONENT_FIELD: { name: "OPPONENT_FIELD", value: "opponentField" },
  PILES: { name: "PILES", value: "piles" },
  CONTROLS: { name: "CONTROLS", value: "controls" },
} as const;

export type ArenaInputRegion = (typeof ArenaInputRegion)[keyof typeof ArenaInputRegion]["value"];
