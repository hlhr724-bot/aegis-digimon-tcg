import { describe, expect, it } from "vitest";
import { allCards } from "#shared/cards/registry";
import { sameTrait } from "#shared/cards/effectiveTraits";

describe("printed Blue Flare traits", () => {
  it("displays the printed trait spelling for every matching card", () => {
    const blueFlareCards = allCards().filter((card) => card.types?.some((trait) => sameTrait(trait, "Blue Flare")));

    expect(blueFlareCards.map((card) => card.cardId)).toContain("BT10-024");
    expect(blueFlareCards.filter((card) => !card.types?.includes("Blue Flare")).map((card) => card.cardId)).toEqual([]);
  });
});
