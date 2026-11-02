import { describe, expect, it } from "vitest";
import { cardList } from "./index.js";

const PRINTED_TEXT_FIELDS = ["effectText", "inheritedEffectText", "securityEffectText"] as const;

function hasBalancedBrackets(text: string) {
  let depth = 0;
  for (const character of text) {
    if (character === "[") {
      depth += 1;
    } else if (character === "]") {
      depth -= 1;
      if (depth < 0) {
        return false;
      }
    }
  }
  return depth === 0;
}

describe("card data printed text brackets", () => {
  it("opens every timing and name bracket that it closes", () => {
    const unbalanced = cardList.flatMap((card) =>
      PRINTED_TEXT_FIELDS.filter((field) => !hasBalancedBrackets(card[field] ?? "")).map(
        (field) => `${card.cardId}.${field}`,
      ),
    );

    expect(unbalanced).toEqual([]);
  });
});
