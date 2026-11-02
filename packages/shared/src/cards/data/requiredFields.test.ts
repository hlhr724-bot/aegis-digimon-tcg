import { describe, expect, it } from "vitest";
import { cardList } from "./index.js";

const REQUIRED_FIELDS = [
  "cardId",
  "set",
  "nameEn",
  "kinds",
  "colors",
  "playCost",
  "dp",
  "evoCosts",
  "maxCountInDeck",
] as const;

describe("card data required fields", () => {
  it("gives every card each required CardDefinition field", () => {
    const missing = cardList.flatMap((card) =>
      REQUIRED_FIELDS.filter((field) => card[field] === undefined).map((field) => `${card.cardId}.${field}`),
    );

    expect(missing).toEqual([]);
  });
});
