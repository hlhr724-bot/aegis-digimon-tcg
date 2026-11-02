import { expect, it } from "vitest";
import { storyBattles } from "@aegis/shared/story/storyBattles";
import { definitionOf, canDigivolveOntoWithAlternates } from "#api/engine/cards/cardData";
import { getStoryScenario } from "#api/story/getStoryScenario";
import { getStorySeatDeck } from "#api/story/getStorySeatDeck";
import { validateDecklist } from "#api/engine/deckValidation";
import "#api/cards/index";

it("gives the Beatbreak finale a legal Shambala deck with all four Assembly names", () => {
  const fixture = getStoryScenario("bb13")!;
  const deck = getStorySeatDeck({ fixture, seat: 1 });
  expect(validateDecklist(deck)).toEqual({ ok: true });
  for (const card of ["EX12-048", "EX12-015", "EX12-029", "EX12-045", "EX12-056"]) {
    expect(deck.mainDeck).toContain(card);
  }
  expect(deck.mainDeck).not.toContain("BT25-063");
  const cards = [...new Set([...deck.mainDeck, ...deck.eggDeck])].map(definitionOf);
  for (const card of cards.filter((entry) => (entry.level ?? 0) > 3)) {
    expect({ card: card.cardId, hasSource: cards.some((base) => canDigivolveOntoWithAlternates(card, base)) }).toEqual({
      card: card.cardId,
      hasSource: true,
    });
  }
  expect(storyBattles.find((battle) => battle.id === "bb13")!.coverImageUrl).toContain("EX12-048");
});
