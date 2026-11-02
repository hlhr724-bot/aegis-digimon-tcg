import { Phase } from "#shared/schema/enums";
import type { TutorialLesson } from "#shared/tutorial/TutorialLesson";
import { TutorialGoalKind } from "#shared/tutorial/TutorialGoalKind";
import { TutorialHighlightKind } from "#shared/tutorial/TutorialHighlightKind";

export const combatKeywordDrills: readonly TutorialLesson[] = [
  {
    id: "drill-retaliation",
    keyword: "Retaliation",
    minutes: 3,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT20-062" },
      },
      {
        id: "retaliate",
        goal: { kind: TutorialGoalKind.OPPONENT_TRASH_HAS_CARD.value, cardId: "BT14-011" },
        highlight: { kind: TutorialHighlightKind.OPPONENT_FIELD_CARD.value, cardId: "BT14-011" },
      },
      {
        id: "win",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST1-05" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-05" },
      },
    ],
  },
  {
    id: "drill-blitz",
    keyword: "Blitz",
    minutes: 3,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.HAND_CARD.value, cardId: "BT8-013" },
      },
      {
        id: "digivolve",
        goal: { kind: TutorialGoalKind.FIELD_HAS_CARD.value, cardId: "BT8-013" },
        highlight: { kind: TutorialHighlightKind.HAND_CARD.value, cardId: "BT8-013" },
      },
      {
        id: "blitz-attack",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "BT8-013" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT8-013" },
      },
    ],
  },
  {
    id: "drill-raid",
    keyword: "Raid",
    minutes: 3,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT11-010" },
      },
      {
        id: "raid",
        goal: { kind: TutorialGoalKind.OPPONENT_TRASH_HAS_CARD.value, cardId: "BT14-011" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT11-010" },
      },
      {
        id: "win",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST1-05" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-05" },
      },
    ],
  },
  {
    id: "drill-collision",
    keyword: "Collision",
    minutes: 3,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "EX8-051" },
      },
      {
        id: "collision",
        goal: { kind: TutorialGoalKind.OPPONENT_SECURITY_AT_MOST.value, count: 0 },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "EX8-051" },
      },
      {
        id: "win",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST1-05" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-05" },
      },
    ],
  },
  {
    id: "drill-vortex",
    keyword: "Vortex",
    minutes: 3,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.HAND_CARD.value, cardId: "ST18-08" },
      },
      {
        id: "play",
        goal: { kind: TutorialGoalKind.FIELD_HAS_CARD.value, cardId: "ST18-08" },
        highlight: { kind: TutorialHighlightKind.HAND_CARD.value, cardId: "ST18-08" },
      },
      {
        id: "vortex",
        goal: { kind: TutorialGoalKind.OPPONENT_TRASH_HAS_CARD.value, cardId: "BT14-011" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST18-08" },
      },
      { id: "opponent-turn", goal: { kind: TutorialGoalKind.OPPONENT_TURN.value } },
      { id: "your-turn", goal: { kind: TutorialGoalKind.VIEWER_PHASE.value, phase: Phase.Main } },
      {
        id: "win",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST18-08" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST18-08" },
      },
    ],
  },
  {
    id: "drill-overclock",
    keyword: "Overclock",
    minutes: 3,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST19-08" },
      },
      {
        id: "clear-security",
        goal: { kind: TutorialGoalKind.OPPONENT_SECURITY_AT_MOST.value, count: 0 },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST19-08" },
      },
      {
        id: "overclock",
        goal: { kind: TutorialGoalKind.TRASH_HAS_CARD.value, cardId: "ST19-03" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST19-08" },
      },
    ],
  },
  {
    id: "drill-iceclad",
    keyword: "Iceclad",
    minutes: 3,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "EX11-016" },
      },
      {
        id: "iceclad",
        goal: { kind: TutorialGoalKind.OPPONENT_TRASH_HAS_CARD.value, cardId: "ST1-11" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "EX11-016" },
      },
      {
        id: "win",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST1-05" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-05" },
      },
    ],
  },
  {
    id: "drill-execute",
    keyword: "Execute",
    minutes: 3,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT20-072" },
      },
      {
        id: "execute",
        goal: { kind: TutorialGoalKind.TRASH_HAS_CARD.value, cardId: "BT20-072" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "BT20-072" },
      },
      { id: "opponent-turn", goal: { kind: TutorialGoalKind.OPPONENT_TURN.value } },
      { id: "your-turn", goal: { kind: TutorialGoalKind.VIEWER_PHASE.value, phase: Phase.Main } },
      {
        id: "win",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST1-05" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-05" },
      },
    ],
  },
  {
    id: "drill-progress",
    keyword: "Progress",
    minutes: 3,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "P-189" },
      },
      {
        id: "progress",
        goal: { kind: TutorialGoalKind.OPPONENT_SECURITY_AT_MOST.value, count: 0 },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "P-189" },
      },
      {
        id: "end-turn",
        goal: { kind: TutorialGoalKind.OPPONENT_TURN.value },
        highlight: { kind: TutorialHighlightKind.END_TURN.value },
      },
      { id: "your-turn", goal: { kind: TutorialGoalKind.VIEWER_PHASE.value, phase: Phase.Main } },
      {
        id: "win",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "P-189" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "P-189" },
      },
    ],
  },
  {
    id: "drill-engage",
    keyword: "Engage",
    minutes: 3,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "EX13-013" },
      },
      {
        id: "keep-ready",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "EX13-013" },
      },
      {
        id: "engage",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "EX13-013" },
        highlight: { kind: TutorialHighlightKind.END_TURN.value },
      },
    ],
  },
  {
    id: "drill-barrier",
    keyword: "Barrier",
    minutes: 3,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "EX6-019" },
      },
      {
        id: "barrier",
        goal: { kind: TutorialGoalKind.VIEWER_SECURITY_AT_MOST.value, count: 0 },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "EX6-019" },
      },
      {
        id: "end-turn",
        goal: { kind: TutorialGoalKind.OPPONENT_TURN.value },
        highlight: { kind: TutorialHighlightKind.END_TURN.value },
      },
      { id: "your-turn", goal: { kind: TutorialGoalKind.VIEWER_PHASE.value, phase: Phase.Main } },
      {
        id: "win",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "EX6-019" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "EX6-019" },
      },
    ],
  },
  {
    id: "drill-training",
    keyword: "Training",
    minutes: 3,
    rulesChapterId: "keywords",
    steps: [
      {
        id: "intro",
        goal: { kind: TutorialGoalKind.ACKNOWLEDGE.value },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "EX9-009" },
      },
      {
        id: "train",
        goal: { kind: TutorialGoalKind.STACK_HEIGHT_AT_LEAST.value, cardId: "EX9-009", height: 2 },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "EX9-009" },
      },
      {
        id: "end-turn",
        goal: { kind: TutorialGoalKind.OPPONENT_TURN.value },
        highlight: { kind: TutorialHighlightKind.END_TURN.value },
      },
      { id: "your-turn", goal: { kind: TutorialGoalKind.VIEWER_PHASE.value, phase: Phase.Main } },
      {
        id: "battle",
        goal: { kind: TutorialGoalKind.OPPONENT_TRASH_HAS_CARD.value, cardId: "ST2-07" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "EX9-009" },
      },
      {
        id: "win",
        goal: { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId: "ST1-04" },
        highlight: { kind: TutorialHighlightKind.FIELD_CARD.value, cardId: "ST1-04" },
      },
    ],
  },
];
