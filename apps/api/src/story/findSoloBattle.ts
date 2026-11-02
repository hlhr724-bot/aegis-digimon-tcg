import type { SoloBattle } from "#api/story/SoloBattle";
import { getStoryScenario } from "#api/story/getStoryScenario";
import { getKeywordDrillScenario } from "#api/tutorial/getKeywordDrillScenario";
import { getTutorialScenario } from "#api/tutorial/getTutorialScenario";
import { getRulePracticeScenario } from "#api/tutorial/getRulePracticeScenario";
import { storyBattles } from "@aegis/shared/story/storyBattles";
import { keywordDrills } from "@aegis/shared/tutorial/keywordDrills";
import { tutorialLessons } from "@aegis/shared/tutorial/tutorialLessons";
import { rulePracticeLessons } from "@aegis/shared/tutorial/rulePracticeLessons";

const tutorialOpponentName = "Training Bot";

function findStoryBattle(id: string): SoloBattle | undefined {
  const battle = storyBattles.find((entry) => entry.id === id);
  const fixture = battle?.playable ? getStoryScenario(battle.id) : undefined;
  if (!battle || !fixture) {
    return undefined;
  }
  return {
    id: battle.id,
    playerName: battle.character,
    deckName: battle.title,
    opponentName: battle.opponent,
    ...(battle.prerequisiteId ? { prerequisiteId: battle.prerequisiteId } : {}),
    ...(battle.prerequisiteIds ? { prerequisiteIds: battle.prerequisiteIds } : {}),
    fixture,
    shuffleDecks: true,
  };
}

function findTutorialBattle(id: string): SoloBattle | undefined {
  const index = tutorialLessons.findIndex((entry) => entry.id === id);
  const lesson = tutorialLessons[index];
  const fixture = lesson ? getTutorialScenario(lesson.id) : undefined;
  if (!lesson || !fixture) {
    return undefined;
  }
  return {
    id: lesson.id,
    deckName: `Lesson ${index + 1}`,
    opponentName: tutorialOpponentName,
    ...(lesson.prerequisiteId ? { prerequisiteId: lesson.prerequisiteId } : {}),
    fixture,
    shuffleDecks: false,
  };
}

function findKeywordDrillBattle(id: string): SoloBattle | undefined {
  const drill = keywordDrills.find((entry) => entry.id === id);
  const fixture = drill ? getKeywordDrillScenario(drill.id) : undefined;
  if (!drill || !fixture) {
    return undefined;
  }
  return {
    id: drill.id,
    deckName: "Keyword drill",
    opponentName: tutorialOpponentName,
    fixture,
    shuffleDecks: false,
  };
}

function findRulePracticeBattle(id: string): SoloBattle | undefined {
  const lesson = rulePracticeLessons.find((entry) => entry.id === id);
  const fixture = lesson ? getRulePracticeScenario(id) : undefined;
  if (!lesson || !fixture) {
    return undefined;
  }
  return { id, deckName: "Rules practice", opponentName: tutorialOpponentName, fixture, shuffleDecks: false };
}

export function findSoloBattle(id: unknown): SoloBattle | undefined {
  if (typeof id !== "string") {
    return undefined;
  }
  return findStoryBattle(id) ?? findTutorialBattle(id) ?? findKeywordDrillBattle(id) ?? findRulePracticeBattle(id);
}
