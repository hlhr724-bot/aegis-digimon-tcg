import type { Phase } from "#shared/schema/enums";
import type { TutorialGoalKind } from "#shared/tutorial/TutorialGoalKind";
import type { TutorialHighlightKind } from "#shared/tutorial/TutorialHighlightKind";

type GoalOf<Kind extends string, Fields = object> = { kind: Kind } & Fields;

export type TutorialGoal =
  | GoalOf<typeof TutorialGoalKind.ACKNOWLEDGE.value>
  | GoalOf<typeof TutorialGoalKind.VIEWER_PHASE.value, { phase: Phase }>
  | GoalOf<typeof TutorialGoalKind.OPPONENT_TURN.value>
  | GoalOf<typeof TutorialGoalKind.BREEDING_HAS_CARD.value, { cardId?: string }>
  | GoalOf<typeof TutorialGoalKind.FIELD_HAS_CARD.value, { cardId: string }>
  | GoalOf<typeof TutorialGoalKind.HAND_HAS_CARD.value, { cardId: string }>
  | GoalOf<typeof TutorialGoalKind.CARD_UNSUSPENDED.value, { cardId: string }>
  | GoalOf<typeof TutorialGoalKind.STACK_HEIGHT_AT_LEAST.value, { cardId: string; height: number }>
  | GoalOf<typeof TutorialGoalKind.CARD_SUSPENDED.value, { cardId: string }>
  | GoalOf<typeof TutorialGoalKind.TRASH_HAS_CARD.value, { cardId: string }>
  | GoalOf<typeof TutorialGoalKind.OPPONENT_SECURITY_AT_MOST.value, { count: number }>
  | GoalOf<typeof TutorialGoalKind.BLOCK_WINDOW_OPEN.value>
  | GoalOf<typeof TutorialGoalKind.OPPONENT_TRASH_HAS_CARD.value, { cardId: string }>
  | GoalOf<typeof TutorialGoalKind.VIEWER_SECURITY_AT_MOST.value, { count: number }>
  | GoalOf<typeof TutorialGoalKind.VIEWER_SECURITY_AT_LEAST.value, { count: number }>
  | GoalOf<typeof TutorialGoalKind.PERMANENT_LINK_COUNT_AT_LEAST.value, { cardId: string; count: number }>
  | GoalOf<typeof TutorialGoalKind.PERMANENT_LINK_COUNT_AT_MOST.value, { cardId: string; count: number }>
  | GoalOf<typeof TutorialGoalKind.STACK_HEIGHT_AT_MOST.value, { cardId: string; height: number }>
  | GoalOf<typeof TutorialGoalKind.STACK_HAS_CARD.value, { cardId: string; sourceCardId: string }>
  | GoalOf<typeof TutorialGoalKind.MEMORY_AT_LEAST.value, { amount: number }>;

export type TutorialHighlight =
  | { kind: typeof TutorialHighlightKind.HAND_CARD.value; cardId: string }
  | { kind: typeof TutorialHighlightKind.FIELD_CARD.value; cardId: string }
  | { kind: typeof TutorialHighlightKind.OPPONENT_FIELD_CARD.value; cardId: string }
  | { kind: typeof TutorialHighlightKind.BREEDING.value }
  | { kind: typeof TutorialHighlightKind.MEMORY.value }
  | { kind: typeof TutorialHighlightKind.END_TURN.value }
  | { kind: typeof TutorialHighlightKind.OPPONENT_SECURITY.value };

export type TutorialStep = {
  id: string;
  goal: TutorialGoal;
  highlight?: TutorialHighlight;
};
