export const TutorialHighlightKind = {
  HAND_CARD: { name: "HAND_CARD", value: "handCard" },
  FIELD_CARD: { name: "FIELD_CARD", value: "fieldCard" },
  OPPONENT_FIELD_CARD: { name: "OPPONENT_FIELD_CARD", value: "opponentFieldCard" },
  BREEDING: { name: "BREEDING", value: "breeding" },
  MEMORY: { name: "MEMORY", value: "memory" },
  END_TURN: { name: "END_TURN", value: "endTurn" },
  OPPONENT_SECURITY: { name: "OPPONENT_SECURITY", value: "opponentSecurity" },
} as const;

export type TutorialHighlightKind = (typeof TutorialHighlightKind)[keyof typeof TutorialHighlightKind]["value"];
