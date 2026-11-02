export const TutorialGoalKind = {
  ACKNOWLEDGE: { name: "ACKNOWLEDGE", value: "acknowledge" },
  VIEWER_PHASE: { name: "VIEWER_PHASE", value: "viewerPhase" },
  OPPONENT_TURN: { name: "OPPONENT_TURN", value: "opponentTurn" },
  BREEDING_HAS_CARD: { name: "BREEDING_HAS_CARD", value: "breedingHasCard" },
  FIELD_HAS_CARD: { name: "FIELD_HAS_CARD", value: "fieldHasCard" },
  STACK_HEIGHT_AT_LEAST: { name: "STACK_HEIGHT_AT_LEAST", value: "stackHeightAtLeast" },
  CARD_SUSPENDED: { name: "CARD_SUSPENDED", value: "cardSuspended" },
  TRASH_HAS_CARD: { name: "TRASH_HAS_CARD", value: "trashHasCard" },
  OPPONENT_SECURITY_AT_MOST: { name: "OPPONENT_SECURITY_AT_MOST", value: "opponentSecurityAtMost" },
  BLOCK_WINDOW_OPEN: { name: "BLOCK_WINDOW_OPEN", value: "blockWindowOpen" },
  OPPONENT_TRASH_HAS_CARD: { name: "OPPONENT_TRASH_HAS_CARD", value: "opponentTrashHasCard" },
  VIEWER_SECURITY_AT_MOST: { name: "VIEWER_SECURITY_AT_MOST", value: "viewerSecurityAtMost" },
  VIEWER_SECURITY_AT_LEAST: { name: "VIEWER_SECURITY_AT_LEAST", value: "viewerSecurityAtLeast" },
  PERMANENT_LINK_COUNT_AT_LEAST: { name: "PERMANENT_LINK_COUNT_AT_LEAST", value: "permanentLinkCountAtLeast" },
  PERMANENT_LINK_COUNT_AT_MOST: { name: "PERMANENT_LINK_COUNT_AT_MOST", value: "permanentLinkCountAtMost" },
  STACK_HEIGHT_AT_MOST: { name: "STACK_HEIGHT_AT_MOST", value: "stackHeightAtMost" },
  STACK_HAS_CARD: { name: "STACK_HAS_CARD", value: "stackHasCard" },
  MEMORY_AT_LEAST: { name: "MEMORY_AT_LEAST", value: "memoryAtLeast" },
  HAND_HAS_CARD: { name: "HAND_HAS_CARD", value: "handHasCard" },
  CARD_UNSUSPENDED: { name: "CARD_UNSUSPENDED", value: "cardUnsuspended" },
} as const;

export type TutorialGoalKind = (typeof TutorialGoalKind)[keyof typeof TutorialGoalKind]["value"];
