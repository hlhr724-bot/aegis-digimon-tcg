// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { sortSearchResults } from "@/screens/sortSearchResults";
import { CardColor, CardKind, allCards, type CardDefinition } from "@aegis/shared";
import { matchesTraitOrAttributeFilter, useCardFilter } from "./cardFilters";

function searchIds(cards: readonly CardDefinition[], query: string): string[] {
  const { result } = renderHook(() => useCardFilter(cards));
  act(() => result.current.setQuery(query));
  return result.current.filtered.map((card) => card.cardId);
}

function testCard(cardId: string, nameEn: string, text: Partial<CardDefinition> = {}): CardDefinition {
  return {
    cardId,
    set: cardId.split("-")[0]!,
    nameEn,
    kinds: [CardKind.Digimon],
    colors: [CardColor.Black],
    playCost: 3,
    dp: 3000,
    evoCosts: [],
    maxCountInDeck: 4,
    ...text,
  };
}

it.each([
  ["ST23-13", "BEATBREAK"],
  ["BT18-102", "Hybrid"],
  ["BT16-102", "Free"],
  ["BT16-102", "Royal Knight"],
])("matches a later form, attribute or type on %s with %s", (cardId, query) => {
  const card = allCards().find((candidate) => candidate.cardId === cardId)!;

  expect(matchesTraitOrAttributeFilter(card, query)).toBe(true);
  expect(matchesTraitOrAttributeFilter(card, "missing-trait")).toBe(false);
});

describe("card search box", () => {
  it("finds Makoto and other Glowing Dawn cards by traits absent from their effects", () => {
    const cards = allCards().filter(({ cardId }) => ["BT26-095", "ST23-14", "BT1-009"].includes(cardId));
    expect(searchIds(cards, "Glowing Dawn").sort()).toEqual(["BT26-095", "ST23-14"]);
    const { result } = renderHook(() => useCardFilter(cards));
    act(() => result.current.setTraitQuery("Glowing Dawn"));
    expect(result.current.filtered.map(({ cardId }) => cardId).sort()).toEqual(["BT26-095", "ST23-14"]);
  });

  it("finds cards by their effect text, ignoring trait brackets (Discord 1557071980103213056)", () => {
    const gotsumon = allCards().find((candidate) => candidate.cardId === "EX13-047");
    expect(gotsumon?.effectText).toContain("[Royal Knight]");

    expect(searchIds([gotsumon!], "Royal Knight")).toEqual(["EX13-047"]);
    expect(searchIds([gotsumon!], "[royal knight]")).toEqual(["EX13-047"]);
  });

  it("searches inherited, security, and option text, and full-width keyword brackets", () => {
    const cards = [
      testCard("BT1-001", "Inheritor", { inheritedEffectText: "[Your Turn] This Digimon gets +1000 DP." }),
      testCard("BT1-002", "Guard", { effectText: "＜Blocker＞" }),
      testCard("BT1-003", "Trigger", { securityEffectText: "[Security] Activate this card's [Main] effect." }),
      testCard("BT1-004", "Dual", { optionEffect: "[Main] Delete 1 of your opponent's Digimon." }),
    ];

    expect(searchIds(cards, "+1000 dp")).toEqual(["BT1-001"]);
    expect(searchIds(cards, "<blocker>")).toEqual(["BT1-002"]);
    expect(searchIds(cards, "security")).toEqual(["BT1-003"]);
    expect(searchIds(cards, "delete 1")).toEqual(["BT1-004"]);
  });

  it("keeps name and card number matches ahead of text-only matches", () => {
    const cards = [
      testCard("BT1-010", "Greymon", { effectText: "Digivolve into a card with [Agumon] in its name." }),
      testCard("BT1-011", "Agumon"),
      testCard("BT1-012", "Gabumon"),
    ];

    expect(searchIds(cards, "agumon")).toEqual(["BT1-011", "BT1-010"]);
    expect(searchIds(cards, "bt1-012")).toEqual(["BT1-012"]);
    expect(
      sortSearchResults({ cards: [cards[0]!, cards[1]!], sort: "name", query: "agumon" }).map((c) => c.nameEn),
    ).toEqual(["Agumon", "Greymon"]);
  });

  it("keeps level ordering across name and trait search matches", () => {
    const cards = [
      testCard("BT1-001", "Dragon Lord", { level: 6 }),
      testCard("BT1-002", "Small Beast", { level: 3, types: ["Dragon"] }),
      testCard("BT1-003", "Dragon Champion", { level: 4 }),
    ];
    expect(sortSearchResults({ cards, sort: "level", query: "dragon" }).map((card) => card.level)).toEqual([3, 4, 6]);
  });

  it("lists a field group's members by its name or abbreviation alongside normal matches (issue 5330)", () => {
    const cards = [
      testCard("BT1-020", "Seadramon", { types: ["Aquatic", "DS"] }),
      testCard("BT1-021", "Deep Savers", { kinds: [CardKind.Option], types: ["DS"] }),
      testCard("BT1-022", "Gotsumon", { types: ["Rock", "ME"] }),
      testCard("BT1-023", "Dsamon", { effectText: "Mentions deep savers in text." }),
    ];

    expect(searchIds(cards, "deep savers")).toEqual(["BT1-020", "BT1-021", "BT1-023"]);
    expect(searchIds(cards, "DS")).toEqual(["BT1-020", "BT1-021", "BT1-023"]);
    expect(searchIds(cards, "metal empire")).toEqual(["BT1-022"]);
    expect(searchIds(cards, "dsa")).toEqual(["BT1-023"]);
  });

  it("filters the trait box by a field group's name or abbreviation", () => {
    const cards = [
      testCard("BT1-030", "Rosemon", { types: ["Fairy", "WG"] }),
      testCard("BT1-031", "Agumon", { types: ["Reptile"] }),
    ];
    const { result } = renderHook(() => useCardFilter(cards));

    act(() => result.current.setTraitQuery("wind guardians"));
    expect(result.current.filtered.map((card) => card.cardId)).toEqual(["BT1-030"]);

    act(() => result.current.setTraitQuery("wg"));
    expect(result.current.filtered.map((card) => card.cardId)).toEqual(["BT1-030"]);
  });
});
