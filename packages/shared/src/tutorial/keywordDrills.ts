import { Phase } from "#shared/schema/enums";
import type { TutorialLesson } from "#shared/tutorial/TutorialLesson";
import { TutorialGoalKind } from "#shared/tutorial/TutorialGoalKind";
import { TutorialHighlightKind } from "#shared/tutorial/TutorialHighlightKind";
import { combatKeywordDrills } from "#shared/tutorial/combatKeywordDrills";
import { protectionKeywordDrills } from "#shared/tutorial/protectionKeywordDrills";
import { evolutionKeywordDrills } from "#shared/tutorial/evolutionKeywordDrills";

const acknowledge = { kind: TutorialGoalKind.ACKNOWLEDGE.value };
const yourTurn = { kind: TutorialGoalKind.VIEWER_PHASE.value, phase: Phase.Main };
const opponentTurn = { kind: TutorialGoalKind.OPPONENT_TURN.value };
const blockWindowOpen = { kind: TutorialGoalKind.BLOCK_WINDOW_OPEN.value };
const endTurnButton = { kind: TutorialHighlightKind.END_TURN.value };
const drillMinutes = 2;
const drillChapterId = "keywords";

function getFieldCard(cardId: string) {
  return { kind: TutorialHighlightKind.FIELD_CARD.value, cardId };
}

function getHandCard(cardId: string) {
  return { kind: TutorialHighlightKind.HAND_CARD.value, cardId };
}

function getOpponentFieldCard(cardId: string) {
  return { kind: TutorialHighlightKind.OPPONENT_FIELD_CARD.value, cardId };
}

function getSuspendedGoal(cardId: string) {
  return { kind: TutorialGoalKind.CARD_SUSPENDED.value, cardId };
}

function getFieldGoal(cardId: string) {
  return { kind: TutorialGoalKind.FIELD_HAS_CARD.value, cardId };
}

const clearedSecurity = { kind: TutorialGoalKind.OPPONENT_SECURITY_AT_MOST.value, count: 0 };

export const keywordDrills: readonly TutorialLesson[] = [
  {
    id: "drill-blocker",
    keyword: "Blocker",
    minutes: drillMinutes,
    rulesChapterId: drillChapterId,
    steps: [
      { id: "intro", goal: acknowledge, highlight: getFieldCard("BT14-011") },
      { id: "incoming-attack", goal: blockWindowOpen, highlight: getOpponentFieldCard("ST2-02") },
      { id: "block", goal: getSuspendedGoal("BT14-011"), highlight: getFieldCard("BT14-011") },
      { id: "your-turn", goal: yourTurn },
      { id: "attack-player", goal: getSuspendedGoal("BT14-011"), highlight: getFieldCard("BT14-011") },
    ],
  },
  {
    id: "drill-rush",
    keyword: "Rush",
    minutes: drillMinutes,
    rulesChapterId: drillChapterId,
    steps: [
      { id: "intro", goal: acknowledge, highlight: getHandCard("BT4-038") },
      { id: "play-rush", goal: getFieldGoal("BT4-038"), highlight: getHandCard("BT4-038") },
      { id: "attack-player", goal: getSuspendedGoal("BT4-038"), highlight: getFieldCard("BT4-038") },
    ],
  },
  {
    id: "drill-piercing",
    keyword: "Piercing",
    minutes: drillMinutes,
    rulesChapterId: drillChapterId,
    steps: [
      { id: "intro", goal: acknowledge, highlight: getOpponentFieldCard("BT14-011") },
      { id: "attack-blocked", goal: getSuspendedGoal("BT10-050"), highlight: getFieldCard("BT10-050") },
      { id: "pierced", goal: acknowledge, highlight: { kind: TutorialHighlightKind.OPPONENT_SECURITY.value } },
      { id: "attack-player", goal: getSuspendedGoal("ST1-05"), highlight: getFieldCard("ST1-05") },
    ],
  },
  {
    id: "drill-security-attack",
    keyword: "SecurityAttack",
    minutes: drillMinutes,
    rulesChapterId: drillChapterId,
    steps: [
      { id: "intro", goal: acknowledge, highlight: getFieldCard("BT5-069") },
      { id: "attack-security", goal: clearedSecurity, highlight: getFieldCard("BT5-069") },
      { id: "attack-player", goal: getSuspendedGoal("ST1-05"), highlight: getFieldCard("ST1-05") },
    ],
  },
  {
    id: "drill-recovery",
    keyword: "Recovery",
    minutes: drillMinutes,
    rulesChapterId: drillChapterId,
    steps: [
      { id: "intro", goal: acknowledge, highlight: getHandCard("ST3-09") },
      { id: "digivolve", goal: getFieldGoal("ST3-09"), highlight: getHandCard("ST3-09") },
      { id: "end-turn", goal: opponentTurn, highlight: endTurnButton },
      { id: "your-turn", goal: yourTurn },
      { id: "attack-player", goal: getSuspendedGoal("ST3-09"), highlight: getFieldCard("ST3-09") },
    ],
  },
  {
    id: "drill-draw",
    keyword: "Draw",
    minutes: drillMinutes,
    rulesChapterId: drillChapterId,
    steps: [
      { id: "intro", goal: acknowledge, highlight: getHandCard("BT1-029") },
      { id: "play-gabumon", goal: getFieldGoal("BT1-029"), highlight: getHandCard("BT1-029") },
      { id: "play-drawn", goal: getFieldGoal("BT4-038"), highlight: getHandCard("BT4-038") },
      { id: "attack-security", goal: clearedSecurity, highlight: getFieldCard("ST1-05") },
      { id: "attack-player", goal: getSuspendedGoal("BT4-038"), highlight: getFieldCard("BT4-038") },
    ],
  },
  {
    id: "drill-jamming",
    keyword: "Jamming",
    minutes: drillMinutes,
    rulesChapterId: drillChapterId,
    steps: [
      { id: "intro", goal: acknowledge, highlight: getFieldCard("BT1-016") },
      { id: "attack-security", goal: clearedSecurity, highlight: getFieldCard("BT1-016") },
      { id: "end-turn", goal: opponentTurn, highlight: endTurnButton },
      { id: "your-turn", goal: yourTurn },
      { id: "attack-player", goal: getSuspendedGoal("BT1-016"), highlight: getFieldCard("BT1-016") },
    ],
  },
  {
    id: "drill-reboot",
    keyword: "Reboot",
    minutes: drillMinutes,
    rulesChapterId: drillChapterId,
    steps: [
      { id: "intro", goal: acknowledge, highlight: getFieldCard("BT2-065") },
      { id: "incoming-attack", goal: blockWindowOpen, highlight: getOpponentFieldCard("ST2-05") },
      { id: "block", goal: getSuspendedGoal("BT2-065"), highlight: getFieldCard("BT2-065") },
      { id: "your-turn", goal: yourTurn },
      { id: "attack-player", goal: getSuspendedGoal("BT2-065"), highlight: getFieldCard("BT2-065") },
    ],
  },
  {
    id: "drill-de-digivolve",
    keyword: "DeDigivolve",
    minutes: drillMinutes,
    rulesChapterId: drillChapterId,
    steps: [
      { id: "intro", goal: acknowledge, highlight: getOpponentFieldCard("BT14-011") },
      { id: "digivolve", goal: getFieldGoal("ST15-10"), highlight: getHandCard("ST15-10") },
      { id: "attack-player", goal: getSuspendedGoal("ST15-10"), highlight: getFieldCard("ST15-10") },
    ],
  },
  {
    id: "drill-alliance",
    keyword: "Alliance",
    minutes: drillMinutes,
    rulesChapterId: drillChapterId,
    steps: [
      { id: "intro", goal: acknowledge, highlight: getFieldCard("EX4-025") },
      { id: "alliance", goal: getSuspendedGoal("ST1-04"), highlight: getFieldCard("EX4-025") },
      { id: "attack-player", goal: getSuspendedGoal("ST1-05"), highlight: getFieldCard("ST1-05") },
    ],
  },
  ...combatKeywordDrills,
  ...protectionKeywordDrills,
  ...evolutionKeywordDrills,
];
