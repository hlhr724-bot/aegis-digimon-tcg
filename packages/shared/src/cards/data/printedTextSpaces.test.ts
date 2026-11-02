import { describe, expect, it } from "vitest";
import { cardList } from "./index.js";

const PRINTED_TEXT_FIELDS = ["nameEn", "effectText", "inheritedEffectText", "securityEffectText"] as const;
const SPACE_ENTITY = /&#160;|&#xA0;|&nbsp;/i;

describe("card data printed text spaces", () => {
  it("stores spaces as plain characters instead of HTML entities", () => {
    const encoded = cardList.flatMap((card) =>
      PRINTED_TEXT_FIELDS.filter((field) => SPACE_ENTITY.test(card[field] ?? "")).map(
        (field) => `${card.cardId}.${field}`,
      ),
    );

    expect(encoded).toEqual([]);
  });
});
