import type { TutorialLesson } from "#shared/tutorial/TutorialLesson";
import { TutorialGoalKind } from "#shared/tutorial/TutorialGoalKind";
import { TutorialHighlightKind } from "#shared/tutorial/TutorialHighlightKind";
import { tutorialLessons } from "#shared/tutorial/tutorialLessons";
import { advancedPracticeLessons } from "#shared/tutorial/advancedPracticeLessons";

export const rulePracticeLessons: readonly TutorialLesson[] = [
  ...tutorialLessons.map((lesson): TutorialLesson => ({
    id: lesson.id.replace("tutorial-", "practice-"),
    minutes: lesson.minutes,
    rulesChapterId: lesson.rulesChapterId,
    steps: lesson.steps,
  })),
  {
    id: "practice-game-preparation",
    minutes: 6,
    rulesChapterId: "setup",
    steps: [
      { id: "intro", goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value } },
      {
        id: "hatch",
        goal: { kind: TutorialGoalKind.BREEDING_HAS_CARD.value, cardId: "ST1-01" },
        highlight: { kind: TutorialHighlightKind.BREEDING.value },
      },
      {
        id: "rookie",
        goal: { kind: TutorialGoalKind.BREEDING_HAS_CARD.value, cardId: "ST1-03" },
        highlight: { kind: TutorialHighlightKind.HAND_CARD.value, cardId: "ST1-03" },
      },
      {
        id: "champion",
        goal: { kind: TutorialGoalKind.BREEDING_HAS_CARD.value, cardId: "ST1-07" },
        highlight: { kind: TutorialHighlightKind.HAND_CARD.value, cardId: "ST1-07" },
      },
      {
        id: "move",
        goal: { kind: TutorialGoalKind.FIELD_HAS_CARD.value, cardId: "ST1-07" },
        highlight: { kind: TutorialHighlightKind.BREEDING.value },
      },
      {
        id: "ultimate",
        goal: { kind: TutorialGoalKind.FIELD_HAS_CARD.value, cardId: "ST1-08" },
        highlight: { kind: TutorialHighlightKind.HAND_CARD.value, cardId: "ST1-08" },
      },
      {
        id: "first-checks",
        goal: { kind: TutorialGoalKind.OPPONENT_SECURITY_AT_MOST.value, count: 3 },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-08" },
      },
      {
        id: "second-attacker",
        goal: { kind: TutorialGoalKind.FIELD_HAS_CARD.value, cardId: "ST1-02" },
        highlight: { kind: TutorialHighlightKind.HAND_CARD.value, cardId: "ST1-02" },
      },
      {
        id: "clear-security",
        goal: { kind: TutorialGoalKind.OPPONENT_SECURITY_AT_MOST.value, count: 0 },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-08" },
      },
      {
        id: "win",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST1-02" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-02" },
      },
    ],
  },
  {
    id: "practice-rule-checks",
    minutes: 2,
    rulesChapterId: "checks",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.OPPONENT_FIELD_CARD.value, cardId: "BT14-011" },
      },
      {
        id: "reduce-dp",
        goal: { kind: TutorialGoalKind.OPPONENT_TRASH_HAS_CARD.value, cardId: "BT14-011" },
        highlight: { kind: TutorialHighlightKind.HAND_CARD.value, cardId: "ST3-16" },
      },
      {
        id: "win",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST3-02" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST3-02" },
      },
    ],
  },
  ...advancedPracticeLessons,
];
