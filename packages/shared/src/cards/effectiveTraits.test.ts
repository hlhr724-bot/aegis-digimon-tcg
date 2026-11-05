import { describe, expect, it } from "vitest";
import { effectiveExactNames, effectiveSubstringOnlyNames } from "./effectiveNames.js";
import { effectiveStaticTraits } from "./effectiveTraits.js";
import { getCardDefinition } from "./registry.js";

describe("effectiveStaticTraits", () => {
  it.each([
    ["EX13-025", ["Witchelny"]],
    ["EX13-056", ["Machine"]],
    ["BT16-036", ["Boss", "D-Brigade"]],
    ["BT24-086", ["DigiPolice"]],
    ["EX13-066", ["Data"]],
  ])("adds the printed Rule trait on %s in every zone", (cardId, traits) => {
    expect(effectiveStaticTraits(getCardDefinition(cardId)!)).toEqual(expect.arrayContaining(traits));
  });
});

describe("Rule name phrasings", () => {
  it("reads EX13-066's 'Also has Name' alias as an exact name", () => {
    expect(effectiveExactNames(getCardDefinition("EX13-066")!)).toContain("Sistermon Ciel (Awakened)");
  });

  it("keeps EX13-053's 'Treated as including [Mamemon]' a substring alias (Q7377)", () => {
    const thundermon = getCardDefinition("EX13-053")!;
    expect(effectiveExactNames(thundermon)).not.toContain("Mamemon");
    expect(effectiveSubstringOnlyNames(thundermon)).toContain("Mamemon");
  });
});

it.each(["BT10-025", "BT10-020", "EX4-018"])("uses the printed Blue Flare trait spelling for %s", (cardId) => {
  expect(effectiveStaticTraits(getCardDefinition(cardId)!)).toContain("Blue Flare");
  expect(effectiveStaticTraits(getCardDefinition(cardId)!)).not.toContain("BlueFlare");
});
