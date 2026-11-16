import { describe, expect, it } from "vitest";
import {
  effectiveExactNames,
  effectiveStaticNames,
  effectiveSubstringOnlyNames,
  nameIncludesToken,
} from "./effectiveNames.js";
import { allCards, getCardDefinition } from "./registry.js";

describe("effectiveStaticNames", () => {
  it("includes Crossroad Witch's printed Shuu Yulin identity (Q5674)", () => {
    expect(effectiveStaticNames(getCardDefinition("BT24-086")!)).toEqual(["The Crossroad Witch", "Shuu Yulin"]);
  });

  it.each([
    ["EX12-041", ["Thundermon", "Mamemon"]],
    ["BT15-012", ["Shoutmon", "Ballistamon"]],
    ["EX5-030", ["Leomon"]],
    ["P-141", ["Mamemon", "Tyrannomon"]],
  ])("parses the bracketed [Rule] Name alias on %s in every zone", (cardId, aliases) => {
    expect(effectiveStaticNames(getCardDefinition(cardId)!)).toEqual(expect.arrayContaining(aliases));
  });

  it.each([
    ["AD1-021", ["Marcus Damon"]],
    ["BT20-087", ["Kota Domoto", "Yuji Musya"]],
    ["EX10-064", ["Yuu Amano", "Nene Amano"]],
    ["ST24-14", ["Yoshino Fujieda", "Keenan Crier"]],
  ])("treats the combined Tamer %s as each printed [Rule] name", (cardId, aliases) => {
    expect(effectiveExactNames(getCardDefinition(cardId)!)).toEqual(expect.arrayContaining(aliases));
  });

  it.each(["EX9-062", "P-101", "BT17-068"])("grants no name from %s's printed level or trait treatment", (cardId) => {
    const definition = getCardDefinition(cardId)!;
    expect(effectiveStaticNames(definition)).toEqual([definition.nameEn]);
  });

  it("grants BT9-051's pre-standard Leomon wording as a substring name only", () => {
    const panjyamon = getCardDefinition("BT9-051")!;
    expect(effectiveSubstringOnlyNames(panjyamon)).toEqual(["Leomon"]);
    expect(effectiveExactNames(panjyamon)).toEqual([panjyamon.nameEn]);
  });

  it.each(["BT21-021", "BT21-027", "BT19-012", "BT11-015"])(
    "excludes DigiXros-only names from ordinary identity gates on %s",
    (cardId) => {
      const definition = getCardDefinition(cardId)!;
      expect(effectiveStaticNames(definition)).toEqual([definition.nameEn]);
    },
  );

  it("keeps the parenthesised (Rule) Name form", () => {
    const parenthesised = getCardDefinition("BT15-060");
    expect(parenthesised).toBeDefined();
    expect(effectiveStaticNames(parenthesised!)).toEqual([parenthesised!.nameEn]);
  });
});

describe("standardized English name substrings", () => {
  it("includes MarineChimairamon only for the standardized Kimeramon token", () => {
    expect(nameIncludesToken("MarineChimairamon", "Kimeramon")).toBe(true);
    expect(nameIncludesToken("MARINECHIMAIRAMON", "kimeramon")).toBe(true);
    expect(nameIncludesToken("MarineChimairamon", "MarineChimairamon")).toBe(true);
    expect(nameIncludesToken("MarineChimairamon", "Kime")).toBe(false);
    expect(nameIncludesToken("MarineChimairamon X", "Kimeramon")).toBe(false);
  });
  const exclusions = [
    ["Pagumon", "Agumon"],
    ["DemiVeemon", "Vee"],
    ["DemiVeemon", "Veemon"],
    ["KendoGarurumon", "Garurumon"],
    ["BurningGreymon", "Greymon"],
    ["DoruGreymon", "Greymon"],
    ["DexDoruGreymon", "Greymon"],
    ["Indramon", "Dramon"],
    ["BeelStarmon", "Starmon"],
    ["BeelStarmon (X Antibody)", "Starmon"],
    ["Blimpmon", "Impmon"],
    ["MasterBlimpmon", "Impmon"],
    ["Gargomon", "Argomon"],
    ["MegaGargomon", "Argomon"],
    ["BlackGargomon", "Argomon"],
    ["BlackMegaGargomon", "Argomon"],
  ];
  it.each(exclusions)("excludes %s from the %s gate for every committed printing", (name, token) => {
    const printings = allCards().filter((card) => card.nameEn === name);
    expect(printings.length).toBeGreaterThan(0);
    expect(printings.map((card) => nameIncludesToken(card.nameEn, token))).toEqual(printings.map(() => false));
    expect(printings.map((card) => nameIncludesToken(card.nameEn, card.nameEn))).toEqual(printings.map(() => true));
  });
  it.each(["Agumon", "Vee", "Veemon", "Garurumon", "Greymon", "Dramon", "Starmon", "Impmon", "Argomon"])(
    "retains ordinary matching for %s",
    (token) => {
      expect(nameIncludesToken(token, token)).toBe(true);
      expect(nameIncludesToken(`Mega${token}`, token)).toBe(true);
    },
  );
  it("normalizes case and punctuation without dropping full identity", () => {
    expect(nameIncludesToken("BEELSTARMON (X ANTIBODY)", "STARmon")).toBe(false);
    expect(nameIncludesToken("Beelstarmon X Antibody", "BeelStarmon (X Antibody)")).toBe(true);
    expect(nameIncludesToken("DemiVeemon", " ")).toBe(false);
  });
});
