import { Phase } from "#shared/schema/enums";
import type { TutorialLesson } from "#shared/tutorial/TutorialLesson";
import { TutorialGoalKind } from "#shared/tutorial/TutorialGoalKind";
import { TutorialHighlightKind } from "#shared/tutorial/TutorialHighlightKind";

const firstLessonId = "tutorial-attack-security";

const acknowledge = { kind: TutorialGoalKind.ACKNOWLEDGE.value };

export const tutorialLessons: readonly TutorialLesson[] = [
  {
    id: firstLessonId,
    minutes: 3,
    rulesChapterId: "attack",
    steps: [
      { id: "intro", goal: acknowledge },
      {
        id: "attack-security",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST1-05" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-05" },
      },
      {
        id: "security-gone",
        goal: acknowledge,
        highlight: { kind: TutorialHighlightKind.OPPONENT_SECURITY.value },
      },
      {
        id: "attack-player",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST1-04" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-04" },
      },
    ],
  },
  {
    id: "tutorial-hatch",
    minutes: 3,
    rulesChapterId: "breeding",
    prerequisiteId: firstLessonId,
    steps: [
      { id: "intro", goal: acknowledge, highlight: { kind: TutorialHighlightKind.BREEDING.value } },
      {
        id: "move-out",
        goal: { kind: TutorialGoalKind.FIELD_HAS_CARD.value, cardId: "ST1-04" },
        highlight: { kind: TutorialHighlightKind.BREEDING.value },
      },
      {
        id: "play-biyomon",
        goal: { kind: TutorialGoalKind.FIELD_HAS_CARD.value, cardId: "ST1-02" },
        highlight: { kind: TutorialHighlightKind.HAND_CARD.value, cardId: "ST1-02" },
      },
      {
        id: "attack-security",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST1-04" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-04" },
      },
      {
        id: "end-turn",
        goal: { kind: TutorialGoalKind.OPPONENT_TURN.value },
        highlight: { kind: TutorialHighlightKind.END_TURN.value },
      },
      {
        id: "hatch",
        goal: { kind: TutorialGoalKind.BREEDING_HAS_CARD.value, cardId: "ST1-01" },
        highlight: { kind: TutorialHighlightKind.BREEDING.value },
      },
      {
        id: "attack-player",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST1-02" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-02" },
      },
    ],
  },
  {
    id: "tutorial-memory",
    minutes: 4,
    rulesChapterId: "memory",
    prerequisiteId: firstLessonId,
    steps: [
      { id: "intro", goal: acknowledge, highlight: { kind: TutorialHighlightKind.MEMORY.value } },
      {
        id: "play-biyomon",
        goal: { kind: TutorialGoalKind.FIELD_HAS_CARD.value, cardId: "ST1-02" },
        highlight: { kind: TutorialHighlightKind.HAND_CARD.value, cardId: "ST1-02" },
      },
      {
        id: "play-birdramon",
        goal: { kind: TutorialGoalKind.FIELD_HAS_CARD.value, cardId: "ST1-05" },
        highlight: { kind: TutorialHighlightKind.HAND_CARD.value, cardId: "ST1-05" },
      },
      {
        id: "attack-security",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST1-05" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-05" },
      },
      {
        id: "attack-player",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST1-02" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-02" },
      },
    ],
  },
  {
    id: "tutorial-digivolve",
    minutes: 4,
    rulesChapterId: "digivolve",
    prerequisiteId: firstLessonId,
    steps: [
      { id: "intro", goal: acknowledge, highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-03" } },
      {
        id: "digivolve",
        goal: { kind: TutorialGoalKind.FIELD_HAS_CARD.value, cardId: "ST1-07" },
        highlight: { kind: TutorialHighlightKind.HAND_CARD.value, cardId: "ST1-07" },
      },
      {
        id: "bonus",
        goal: acknowledge,
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-07" },
      },
      {
        id: "attack-security",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST1-07" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-07" },
      },
      {
        id: "attack-player",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST1-02" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-02" },
      },
    ],
  },
  {
    id: "tutorial-block",
    minutes: 4,
    rulesChapterId: "blocking",
    prerequisiteId: firstLessonId,
    steps: [
      {
        id: "intro",
        goal: acknowledge,
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT14-011" },
      },
      {
        id: "incoming-attack",
        goal: { kind: TutorialGoalKind.BLOCK_WINDOW_OPEN.value },
        highlight: { kind: TutorialHighlightKind.OPPONENT_FIELD_CARD.value, cardId: "ST2-02" },
      },
      {
        id: "block",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "BT14-011" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT14-011" },
      },
      { id: "your-turn", goal: { kind: TutorialGoalKind.VIEWER_PHASE.value, phase: Phase.Main } },
      {
        id: "attack-security",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "BT14-011" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT14-011" },
      },
      {
        id: "attack-player",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST1-05" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-05" },
      },
    ],
  },
  {
    id: "tutorial-tamers",
    minutes: 5,
    rulesChapterId: "cardTypes",
    prerequisiteId: firstLessonId,
    steps: [
      { id: "intro", goal: acknowledge },
      {
        id: "play-tamer",
        goal: { kind: TutorialGoalKind.FIELD_HAS_CARD.value, cardId: "ST1-12" },
        highlight: { kind: TutorialHighlightKind.HAND_CARD.value, cardId: "ST1-12" },
      },
      {
        id: "inherited",
        goal: acknowledge,
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-08" },
      },
      {
        id: "attack-security",
        goal: { kind: TutorialGoalKind.OPPONENT_SECURITY_AT_MOST.value, count: 0 },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-08" },
      },
      {
        id: "attack-player",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST1-04" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-04" },
      },
    ],
  },
];
