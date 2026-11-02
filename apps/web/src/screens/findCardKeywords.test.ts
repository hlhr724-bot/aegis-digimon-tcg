import { describe, expect, it } from "vitest";
import { allCards, type CardDefinition } from "@aegis/shared";
import { findCardKeywords } from "@/screens/findCardKeywords";
import { KEYWORD_FILTERS, SECURITY_ATTACK_MINUS_FILTER, SECURITY_ATTACK_PLUS_FILTER } from "@/screens/KeywordFilter";
import { matchesKeywordFilter } from "@/screens/matchesKeywordFilter";

function getCard(cardId: string): CardDefinition {
  const card = allCards().find((candidate) => candidate.cardId === cardId);
  if (!card) {
    throw new Error(`Missing card ${cardId}`);
  }
  return card;
}

function getKeywords(cardId: string): string[] {
  return [...findCardKeywords(getCard(cardId))].sort();
}

describe("card keyword detection", () => {
  it("finds a printed keyword and ignores its reminder text", () => {
    expect(getKeywords("ST1-06")).toEqual(["Blocker"]);
  });

  it("does not treat removal of Blocker Digimon or unblockable attackers as Blocker", () => {
    expect(getKeywords("BT1-023")).not.toContain("Blocker");
    expect(getKeywords("BT16-005")).not.toContain("Blocker");
    expect(getKeywords("BT1-034")).not.toContain("Blocker");
  });

  it("ignores keywords that only appear inside another keyword's reminder text", () => {
    expect(getKeywords("BT16-032")).toEqual(["ArmorPurge", "Collision"]);
    expect(getKeywords("BT15-087")).toEqual(["Alliance", "MindLink", "Reboot"]);
  });

  it("separates Security Attack bonuses from Security Attack penalties", () => {
    expect(getKeywords("BT10-030")).toContain(SECURITY_ATTACK_MINUS_FILTER);
    expect(getKeywords("BT10-030")).not.toContain(SECURITY_ATTACK_PLUS_FILTER);
    expect(getKeywords("ST15-11")).toContain(SECURITY_ATTACK_PLUS_FILTER);
    expect(getKeywords("BT12-039")).not.toContain(SECURITY_ATTACK_PLUS_FILTER);
  });

  it("counts keywords from inherited effects", () => {
    expect(getKeywords("BT14-055")).toEqual(["Blocker"]);
    expect(getKeywords("AD1-001")).toEqual(["Raid"]);
  });

  it("reads ASCII keyword brackets and skips digivolution requirements that name a keyword", () => {
    expect(getKeywords("BT16-019")).toContain("Blocker");
    expect(getKeywords("BT12-014")).not.toContain("Save");
  });

  it("caches the keywords of each card", () => {
    const card = getCard("ST1-06");
    expect(findCardKeywords(card)).toBe(findCardKeywords(card));
  });

  it("matches any selected keyword and every card when none is selected", () => {
    const coredramon = getCard("ST1-06");
    const greymon = getCard("AD1-001");

    expect(matchesKeywordFilter({ card: coredramon, selectedKeywords: [] })).toBe(true);
    expect(matchesKeywordFilter({ card: coredramon, selectedKeywords: ["Blocker", "Raid"] })).toBe(true);
    expect(matchesKeywordFilter({ card: greymon, selectedKeywords: ["Blocker", "Raid"] })).toBe(true);
    expect(matchesKeywordFilter({ card: greymon, selectedKeywords: ["Blocker"] })).toBe(false);
  });

  it("offers one filter per glossary keyword with Security Attack split by sign", () => {
    const labels = KEYWORD_FILTERS.map((option) => option.label);

    expect(labels).toContain("Blocker");
    expect(labels).toContain("De-Digivolve");
    expect(labels).toContain("Security A. +");
    expect(labels).toContain("Security A. -");
    expect(labels).not.toContain("Security A.");
  });
});
