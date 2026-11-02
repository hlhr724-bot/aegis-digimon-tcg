import { Phase } from "#shared/schema/enums";
import type { TutorialLesson } from "#shared/tutorial/TutorialLesson";
import { TutorialGoalKind } from "#shared/tutorial/TutorialGoalKind";
import { TutorialHighlightKind } from "#shared/tutorial/TutorialHighlightKind";

export const advancedInteractionLessons: readonly TutorialLesson[] = [
  {
    id: "practice-inherited-sacrifice-recruit",
    minutes: 5,
    rulesChapterId: "effects",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT11-043" },
      },
      {
        id: "protect",
        goal: { kind: TutorialGoalKind.TRASH_HAS_CARD.value, cardId: "EX13-028" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT11-043" },
      },
      {
        id: "recruit",
        goal: { kind: TutorialGoalKind.FIELD_HAS_CARD.value, cardId: "BT3-061" },
      },
      { id: "your-turn", goal: { kind: TutorialGoalKind.VIEWER_PHASE.value, phase: Phase.Main } },
      {
        id: "clear-security",
        goal: { kind: TutorialGoalKind.OPPONENT_SECURITY_AT_MOST.value, count: 0 },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT11-043" },
      },
      {
        id: "win",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "BT3-061" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT3-061" },
      },
    ],
  },
  {
    id: "practice-inherited-unsuspend-engage",
    minutes: 5,
    rulesChapterId: "effects",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "EX12-060" },
      },
      {
        id: "clear-security",
        goal: { kind: TutorialGoalKind.OPPONENT_SECURITY_AT_MOST.value, count: 0 },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "EX12-060" },
      },
      {
        id: "order-effects",
        goal: { kind: TutorialGoalKind.CARD_UNSUSPENDED.value, cardId: "EX12-060" },
        highlight: { kind: TutorialHighlightKind.END_TURN.value },
      },
      {
        id: "engage-win",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "EX12-060" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "EX12-060" },
      },
    ],
  },
];
