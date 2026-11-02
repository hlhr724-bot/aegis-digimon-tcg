import { Phase } from "#shared/schema/enums";
import type { TutorialLesson } from "#shared/tutorial/TutorialLesson";
import { TutorialGoalKind } from "#shared/tutorial/TutorialGoalKind";
import { TutorialHighlightKind } from "#shared/tutorial/TutorialHighlightKind";

export const protectionKeywordDrills: readonly TutorialLesson[] = [
  {
    id: "drill-decoy",
    keyword: "Decoy",
    minutes: 2,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT6-063" },
      },
      {
        id: "react",
        goal: { kind: TutorialGoalKind.TRASH_HAS_CARD.value, cardId: "BT6-059" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT6-063" },
      },
      { id: "your-turn", goal: { kind: TutorialGoalKind.VIEWER_PHASE.value, phase: Phase.Main } },
      {
        id: "attack-player",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "BT6-063" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT6-063" },
      },
    ],
  },
  {
    id: "drill-armor-purge",
    keyword: "ArmorPurge",
    minutes: 2,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT10-074" },
      },
      {
        id: "react",
        goal: { kind: TutorialGoalKind.FIELD_HAS_CARD.value, cardId: "ST6-03" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT10-074" },
      },
      { id: "your-turn", goal: { kind: TutorialGoalKind.VIEWER_PHASE.value, phase: Phase.Main } },
      {
        id: "attack-player",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST6-03" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST6-03" },
      },
    ],
  },
  {
    id: "drill-save",
    keyword: "Save",
    minutes: 3,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT10-008" },
      },
      {
        id: "react",
        goal: { kind: TutorialGoalKind.STACK_HEIGHT_AT_LEAST.value, cardId: "BT10-087", height: 2 },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT10-008" },
      },
      { id: "your-turn", goal: { kind: TutorialGoalKind.VIEWER_PHASE.value, phase: Phase.Main } },
      {
        id: "reuse",
        goal: { kind: TutorialGoalKind.FIELD_HAS_CARD.value, cardId: "BT10-111" },
        highlight: { kind: TutorialHighlightKind.HAND_CARD.value, cardId: "BT10-111" },
      },
      {
        id: "attack-player",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "BT10-111" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT10-111" },
      },
    ],
  },
  {
    id: "drill-material-save",
    keyword: "MaterialSave",
    minutes: 3,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT10-024" },
      },
      {
        id: "react",
        goal: { kind: TutorialGoalKind.STACK_HEIGHT_AT_LEAST.value, cardId: "BT10-088", height: 3 },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT10-024" },
      },
      { id: "your-turn", goal: { kind: TutorialGoalKind.VIEWER_PHASE.value, phase: Phase.Main } },
      {
        id: "reuse",
        goal: { kind: TutorialGoalKind.FIELD_HAS_CARD.value, cardId: "BT10-024" },
        highlight: { kind: TutorialHighlightKind.HAND_CARD.value, cardId: "BT10-024" },
      },
      {
        id: "attack-player",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "BT10-024" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT10-024" },
      },
    ],
  },
  {
    id: "drill-evade",
    keyword: "Evade",
    minutes: 2,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT14-021" },
      },
      {
        id: "react",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "BT14-021" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT14-021" },
      },
      { id: "your-turn", goal: { kind: TutorialGoalKind.VIEWER_PHASE.value, phase: Phase.Main } },
      {
        id: "attack-player",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "BT14-021" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT14-021" },
      },
    ],
  },
  {
    id: "drill-fortitude",
    keyword: "Fortitude",
    minutes: 2,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "EX5-036" },
      },
      {
        id: "react",
        goal: { kind: TutorialGoalKind.STACK_HEIGHT_AT_MOST.value, cardId: "EX5-036", height: 1 },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "EX5-036" },
      },
      { id: "your-turn", goal: { kind: TutorialGoalKind.VIEWER_PHASE.value, phase: Phase.Main } },
      {
        id: "attack-player",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "EX5-036" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "EX5-036" },
      },
    ],
  },
  {
    id: "drill-partition",
    keyword: "Partition",
    minutes: 2,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT16-025" },
      },
      {
        id: "react",
        goal: { kind: TutorialGoalKind.FIELD_HAS_CARD.value, cardId: "ST2-05" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT16-025" },
      },
      { id: "your-turn", goal: { kind: TutorialGoalKind.VIEWER_PHASE.value, phase: Phase.Main } },
      {
        id: "attack-player",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST2-05" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST2-05" },
      },
    ],
  },
  {
    id: "drill-scapegoat",
    keyword: "Scapegoat",
    minutes: 2,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "EX6-052" },
      },
      {
        id: "react",
        goal: { kind: TutorialGoalKind.TRASH_HAS_CARD.value, cardId: "ST1-03" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "EX6-052" },
      },
      { id: "your-turn", goal: { kind: TutorialGoalKind.VIEWER_PHASE.value, phase: Phase.Main } },
      {
        id: "attack-player",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "EX6-052" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "EX6-052" },
      },
    ],
  },
  {
    id: "drill-decode",
    keyword: "Decode",
    minutes: 2,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "EX13-065" },
      },
      {
        id: "react",
        goal: { kind: TutorialGoalKind.FIELD_HAS_CARD.value, cardId: "BT6-082" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "EX13-065" },
      },
      { id: "your-turn", goal: { kind: TutorialGoalKind.VIEWER_PHASE.value, phase: Phase.Main } },
      {
        id: "attack-player",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "BT6-082" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT6-082" },
      },
    ],
  },
  {
    id: "drill-fragment",
    keyword: "Fragment",
    minutes: 2,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT26-055" },
      },
      {
        id: "react",
        goal: { kind: TutorialGoalKind.STACK_HEIGHT_AT_MOST.value, cardId: "BT26-055", height: 1 },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT26-055" },
      },
      { id: "your-turn", goal: { kind: TutorialGoalKind.VIEWER_PHASE.value, phase: Phase.Main } },
      {
        id: "attack-player",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "BT26-055" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT26-055" },
      },
    ],
  },
  {
    id: "drill-guard",
    keyword: "Guard",
    minutes: 2,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT6-063" },
      },
      {
        id: "react",
        goal: { kind: TutorialGoalKind.TRASH_HAS_CARD.value, cardId: "EX13-052" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT6-063" },
      },
      { id: "your-turn", goal: { kind: TutorialGoalKind.VIEWER_PHASE.value, phase: Phase.Main } },
      {
        id: "attack-player",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "BT6-063" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT6-063" },
      },
    ],
  },
];
