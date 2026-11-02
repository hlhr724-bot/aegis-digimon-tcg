import { Phase } from "#shared/schema/enums";
import type { TutorialLesson } from "#shared/tutorial/TutorialLesson";
import { TutorialGoalKind } from "#shared/tutorial/TutorialGoalKind";
import { TutorialHighlightKind } from "#shared/tutorial/TutorialHighlightKind";

export const evolutionKeywordDrills: readonly TutorialLesson[] = [
  {
    id: "drill-digisorption",
    keyword: "Digisorption",
    minutes: 3,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT8-053" },
      },
      {
        id: "digivolve",
        goal: { kind: TutorialGoalKind.FIELD_HAS_CARD.value, cardId: "BT8-054" },
        highlight: { kind: TutorialHighlightKind.HAND_CARD.value, cardId: "BT8-054" },
      },
      {
        id: "attack-player",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "BT8-054" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT8-054" },
      },
    ],
  },
  {
    id: "drill-digi-burst",
    keyword: "DigiBurst",
    minutes: 3,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST4-13" },
      },
      {
        id: "burst",
        goal: { kind: TutorialGoalKind.TRASH_HAS_CARD.value, cardId: "ST4-05" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST4-13" },
      },
      {
        id: "attack-security",
        goal: { kind: TutorialGoalKind.OPPONENT_SECURITY_AT_MOST.value, count: 0 },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST4-13" },
      },
      {
        id: "attack-player",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST1-05" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-05" },
      },
    ],
  },
  {
    id: "drill-delay",
    keyword: "Delay",
    minutes: 3,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT6-100" },
      },
      {
        id: "delay",
        goal: { kind: TutorialGoalKind.MEMORY_AT_LEAST.value, amount: 5 },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT6-100" },
      },
      {
        id: "play-rush",
        goal: { kind: TutorialGoalKind.FIELD_HAS_CARD.value, cardId: "BT4-038" },
        highlight: { kind: TutorialHighlightKind.HAND_CARD.value, cardId: "BT4-038" },
      },
      {
        id: "attack-player",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "BT4-038" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT4-038" },
      },
    ],
  },
  {
    id: "drill-blast-digivolve",
    keyword: "BlastDigivolve",
    minutes: 3,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.HAND_CARD.value, cardId: "ST15-12" },
      },
      {
        id: "counter",
        goal: { kind: TutorialGoalKind.FIELD_HAS_CARD.value, cardId: "ST15-12" },
        highlight: { kind: TutorialHighlightKind.HAND_CARD.value, cardId: "ST15-12" },
      },
      {
        id: "block",
        goal: { kind: TutorialGoalKind.OPPONENT_TRASH_HAS_CARD.value, cardId: "ST2-05" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST15-12" },
      },
      { id: "your-turn", goal: { kind: TutorialGoalKind.VIEWER_PHASE.value, phase: Phase.Main } },
      {
        id: "attack-player",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST15-12" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST15-12" },
      },
    ],
  },
  {
    id: "drill-mind-link",
    keyword: "MindLink",
    minutes: 3,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT14-087" },
      },
      {
        id: "mind-link",
        goal: { kind: TutorialGoalKind.STACK_HAS_CARD.value, cardId: "BT14-074", sourceCardId: "BT14-087" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT14-087" },
      },
      {
        id: "alliance",
        goal: { kind: TutorialGoalKind.OPPONENT_SECURITY_AT_MOST.value, count: 0 },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT14-074" },
      },
      {
        id: "attack-player",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST1-04" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-04" },
      },
    ],
  },
  {
    id: "drill-blast-dna-digivolve",
    keyword: "BlastDNADigivolve",
    minutes: 3,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.HAND_CARD.value, cardId: "EX6-011" },
      },
      {
        id: "counter",
        goal: { kind: TutorialGoalKind.FIELD_HAS_CARD.value, cardId: "EX6-011" },
        highlight: { kind: TutorialHighlightKind.HAND_CARD.value, cardId: "EX6-011" },
      },
      { id: "your-turn", goal: { kind: TutorialGoalKind.VIEWER_PHASE.value, phase: Phase.Main } },
      {
        id: "attack-player",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "EX6-011" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "EX6-011" },
      },
    ],
  },
  {
    id: "drill-link",
    keyword: "Link",
    minutes: 3,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "EX10-073" },
      },
      {
        id: "link",
        goal: { kind: TutorialGoalKind.PERMANENT_LINK_COUNT_AT_LEAST.value, cardId: "EX10-073", count: 2 },
        highlight: { kind: TutorialHighlightKind.HAND_CARD.value, cardId: "BT21-047" },
      },
      {
        id: "attack-security",
        goal: { kind: TutorialGoalKind.OPPONENT_SECURITY_AT_MOST.value, count: 0 },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "EX10-073" },
      },
      {
        id: "attack-player",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST1-05" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-05" },
      },
    ],
  },
  {
    id: "drill-use-req",
    keyword: "UseReq",
    minutes: 3,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.HAND_CARD.value, cardId: "ST23-15" },
      },
      {
        id: "use-option",
        goal: { kind: TutorialGoalKind.FIELD_HAS_CARD.value, cardId: "ST23-15" },
        highlight: { kind: TutorialHighlightKind.HAND_CARD.value, cardId: "ST23-15" },
      },
      {
        id: "attack-player",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST23-02" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST23-02" },
      },
    ],
  },
  {
    id: "drill-ascension",
    keyword: "Ascension",
    minutes: 3,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT26-075" },
      },
      {
        id: "ascend",
        goal: { kind: TutorialGoalKind.VIEWER_SECURITY_AT_LEAST.value, count: 1 },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT26-075" },
      },
      {
        id: "end-turn",
        goal: { kind: TutorialGoalKind.OPPONENT_TURN.value },
        highlight: { kind: TutorialHighlightKind.END_TURN.value },
      },
      { id: "your-turn", goal: { kind: TutorialGoalKind.VIEWER_PHASE.value, phase: Phase.Main } },
      {
        id: "attack-player",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST1-05" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-05" },
      },
    ],
  },
  {
    id: "drill-detach",
    keyword: "Detach",
    minutes: 3,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT26-037" },
      },
      {
        id: "detach",
        goal: { kind: TutorialGoalKind.PERMANENT_LINK_COUNT_AT_MOST.value, cardId: "BT26-037", count: 0 },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT26-037" },
      },
      { id: "your-turn", goal: { kind: TutorialGoalKind.VIEWER_PHASE.value, phase: Phase.Main } },
      {
        id: "attack-player",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "BT26-037" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT26-037" },
      },
    ],
  },
  {
    id: "drill-succession",
    keyword: "Succession",
    minutes: 3,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT26-032" },
      },
      {
        id: "copy-effect",
        goal: { kind: TutorialGoalKind.OPPONENT_SECURITY_AT_MOST.value, count: 0 },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST4-04" },
      },
      {
        id: "attack-player",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST1-04" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-04" },
      },
    ],
  },
];
