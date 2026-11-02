import { describe, expect, it } from "vitest";
import { storyBattles } from "@aegis/shared/story/storyBattles";
import { validateDecklist } from "#api/engine/deckValidation";
import { getStoryScenario } from "#api/story/getStoryScenario";
import { getStorySeatDeck } from "#api/story/getStorySeatDeck";

describe("story deck admission", () => {
  it.each(storyBattles.filter((battle) => battle.playable).map((battle) => battle.id))(
    "admits both complete decks for %s",
    (battleId) => {
      const fixture = getStoryScenario(battleId)!;
      for (const seat of [0, 1] as const) {
        const deck = getStorySeatDeck({ fixture, seat });
        expect(validateDecklist(deck, { betaBattleMode: false }), `seat ${seat}`).toEqual({ ok: true });
      }
    },
  );
});
