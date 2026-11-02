import { describe, expect, it } from "vitest";
import { findSoloBattle } from "#api/story/findSoloBattle";
import { storyBattles } from "@aegis/shared/story/storyBattles";
import { keywordDrills } from "@aegis/shared/tutorial/keywordDrills";
import { tutorialLessons } from "@aegis/shared/tutorial/tutorialLessons";
import { advancedPracticeLessons } from "@aegis/shared/tutorial/advancedPracticeLessons";

describe("solo battle lookup", () => {
  it.each(advancedPracticeLessons.map((lesson) => lesson.id))(
    "opens complex effects practice %s with a fixed bot match and no prerequisite",
    (id) => {
      const battle = findSoloBattle(id)!;
      expect(battle).toMatchObject({
        id,
        opponentName: "Training Bot",
        deckName: "Rules practice",
        shuffleDecks: false,
      });
      expect(battle.prerequisiteId).toBeUndefined();
      battle.fixture.board[0]!.deck!.length = 0;
      expect(findSoloBattle(id)!.fixture.board[0]!.deck!.length).toBeGreaterThan(0);
    },
  );
  it("describes a playable story battle with its character, title, and shuffled decks", () => {
    const battle = storyBattles.find((entry) => entry.playable && entry.prerequisiteId)!;
    expect(findSoloBattle(battle.id)).toMatchObject({
      id: battle.id,
      playerName: battle.character,
      deckName: battle.title,
      opponentName: battle.opponent,
      prerequisiteId: battle.prerequisiteId,
      shuffleDecks: true,
    });
  });

  it("describes a tutorial lesson with a numbered deck, the training bot, and fixed decks", () => {
    const lesson = tutorialLessons[1]!;
    const battle = findSoloBattle(lesson.id)!;
    expect(battle).toMatchObject({
      id: lesson.id,
      deckName: "Lesson 2",
      opponentName: "Training Bot",
      prerequisiteId: lesson.prerequisiteId,
      shuffleDecks: false,
    });
    expect(battle.playerName).toBeUndefined();
    expect(battle.fixture.board[0]).toBeDefined();
  });

  it.each(keywordDrills.map((drill) => drill.id))(
    "describes the keyword drill %s with the training bot, fixed decks, and no prerequisite",
    (drillId) => {
      const battle = findSoloBattle(drillId)!;
      expect(battle).toMatchObject({
        id: drillId,
        deckName: "Keyword drill",
        opponentName: "Training Bot",
        shuffleDecks: false,
      });
      expect(battle.playerName).toBeUndefined();
      expect(battle.prerequisiteId).toBeUndefined();
      expect(battle.fixture.board[0]).toBeDefined();
    },
  );

  it("returns a fresh fixture for every lookup", () => {
    const lessonId = tutorialLessons[0]!.id;
    const first = findSoloBattle(lessonId)!;
    first.fixture.board[0]!.deck!.length = 0;
    expect(findSoloBattle(lessonId)!.fixture.board[0]!.deck!.length).toBeGreaterThan(0);
  });

  it.each([undefined, 42, "", "constructor", "tutorial-unknown", "drill-unknown", "practice-unknown"])(
    "ignores the unknown id %s",
    (id) => {
      expect(findSoloBattle(id)).toBeUndefined();
    },
  );
});
