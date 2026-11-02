import { describe, expect, it } from "vitest";
import { BLUE_DECK, RED_DECK } from "#api/engine/testDecks";
import { isEligibleCommunityDeck } from "#api/community/isEligibleCommunityDeck";

describe("isEligibleCommunityDeck", () => {
  it("accepts a legal deck", () => {
    expect(isEligibleCommunityDeck({ deck: RED_DECK, format: undefined, betaAllowed: false })).toBe(true);
  });

  it("rejects a deck that breaks the deck size or copy rules", () => {
    expect(
      isEligibleCommunityDeck({
        deck: { mainDeck: BLUE_DECK.mainDeck.slice(0, 40), eggDeck: BLUE_DECK.eggDeck },
        format: undefined,
        betaAllowed: false,
      }),
    ).toBe(false);
  });
});
