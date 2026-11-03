import { describe, expect, it } from "vitest";
import { storyBattles } from "@aegis/shared/story/storyBattles";
import { getStoryScenario } from "#api/story/getStoryScenario";
import { shuffleStoryDecks } from "#api/story/shuffleStoryDecks";

const randomKey = "a".repeat(64);
const playableBattleIds = storyBattles
  .filter((battle) => battle.playable && !battle.campaignId)
  .map((battle) => battle.id);

describe("story deck shuffling", () => {
  it.each(playableBattleIds)("varies both draw piles while preserving the starting scene in %s", (battleId) => {
    const original = getStoryScenario(battleId)!;
    const first = structuredClone(original);
    const repeated = structuredClone(original);
    const next = structuredClone(original);
    shuffleStoryDecks({ fixture: first, seed: 1, randomKey });
    shuffleStoryDecks({ fixture: repeated, seed: 1, randomKey });
    shuffleStoryDecks({ fixture: next, seed: 2, randomKey });
    expect(first).toEqual(repeated);
    for (const seat of [0, 1] as const) {
      const board = original.board[seat]!;
      const shuffled = first.board[seat]!;
      expect(shuffled.deck).not.toEqual(board.deck);
      expect(shuffled.deck).not.toEqual(next.board[seat]!.deck);
      expect(shuffled.deck).toEqual(expect.arrayContaining(board.deck!));
      expect([...shuffled.deck!].sort()).toEqual([...board.deck!].sort());
      expect([...shuffled.eggDeck!].sort()).toEqual([...board.eggDeck!].sort());
      expect({ ...shuffled, deck: board.deck, eggDeck: board.eggDeck }).toEqual(board);
    }
    expect(getStoryScenario(battleId)).toEqual(original);
  });

  it.each(playableBattleIds)("keys every draw pile to the room's secret random key in %s", (battleId) => {
    const original = getStoryScenario(battleId)!;
    const first = structuredClone(original);
    const otherKey = structuredClone(original);
    shuffleStoryDecks({ fixture: first, seed: 1, randomKey });
    shuffleStoryDecks({ fixture: otherKey, seed: 1, randomKey: "b".repeat(64) });
    for (const seat of [0, 1] as const) {
      expect(otherKey.board[seat]!.deck).not.toEqual(first.board[seat]!.deck);
    }
  });
});
