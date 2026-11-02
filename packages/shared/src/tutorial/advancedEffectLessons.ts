import { Phase } from "#shared/schema/enums";
import type { TutorialLesson } from "#shared/tutorial/TutorialLesson";
import { TutorialGoalKind } from "#shared/tutorial/TutorialGoalKind";
import { TutorialHighlightKind } from "#shared/tutorial/TutorialHighlightKind";

export const advancedEffectLessons: readonly TutorialLesson[] = [
  {
    id: "practice-derived-trash-triggers",
    minutes: 7,
    rulesChapterId: "effects",
    steps: [
      { id: "intro", goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value } },
      {
        id: "attack-and-discard",
        goal: { kind: TutorialGoalKind.TRASH_HAS_CARD.value, cardId: "BT1-009" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT24-045" },
      },
      {
        id: "first-upgrade",
        goal: { kind: TutorialGoalKind.FIELD_HAS_CARD.value, cardId: "BT24-072" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT24-045" },
      },
      {
        id: "derived-draw",
        goal: { kind: TutorialGoalKind.HAND_HAS_CARD.value, cardId: "ST1-08" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT24-072" },
      },
      {
        id: "second-upgrade",
        goal: { kind: TutorialGoalKind.FIELD_HAS_CARD.value, cardId: "BT25-084" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT24-072" },
      },
      {
        id: "finish-checks",
        goal: { kind: TutorialGoalKind.OPPONENT_SECURITY_AT_MOST.value, count: 0 },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT25-084" },
      },
      {
        id: "win",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST1-05" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-05" },
      },
    ],
  },
  {
    id: "practice-order-before-digivolving",
    minutes: 5,
    rulesChapterId: "effects",
    steps: [
      { id: "intro", goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value } },
      {
        id: "declare-attack",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "BT17-023" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT17-023" },
      },
      {
        id: "draw-first",
        goal: { kind: TutorialGoalKind.HAND_HAS_CARD.value, cardId: "BT4-030" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT17-023" },
      },
      {
        id: "digivolve",
        goal: { kind: TutorialGoalKind.FIELD_HAS_CARD.value, cardId: "BT4-030" },
        highlight: { kind: TutorialHighlightKind.HAND_CARD.value, cardId: "BT4-030" },
      },
      {
        id: "end-turn",
        goal: { kind: TutorialGoalKind.OPPONENT_TURN.value },
        highlight: { kind: TutorialHighlightKind.END_TURN.value },
      },
      { id: "your-turn", goal: { kind: TutorialGoalKind.VIEWER_PHASE.value, phase: Phase.Main } },
      {
        id: "win",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "BT4-030" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT4-030" },
      },
    ],
  },
];
