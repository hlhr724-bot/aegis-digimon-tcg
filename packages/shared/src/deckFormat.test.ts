import { describe, expect, it } from "vitest";
import {
  deckFormat,
  createDeckFormat,
  deckFormatSettings,
  formatCardViolation,
  formatCopyLimit,
  formatPairViolations,
  historicalDeckFormats,
  isDeckFormat,
} from "./deckFormat.js";
import { deckLegality } from "./decks/legality.js";

describe("deck formats", () => {
  it("offers released products including BT13, excluding unknown and unverified products", () => {
    expect(historicalDeckFormats("2023-07-21")).toContain("BT13");
    expect(historicalDeckFormats("2023-07-21")).not.toContain("BT14");
    expect(isDeckFormat("BT999")).toBe(false);
    expect(isDeckFormat("LM")).toBe(false);
    expect(deckFormat(undefined)).toBe("standard");
    expect(deckFormat(undefined, true)).toBe("unlimited");
  });
  it("includes earlier boosters, starters and dated promos, and excludes later or undated cards", () => {
    for (const id of ["BT1-010", "BT13-012", "EX4-019", "ST14-02", "P-079"])
      expect(formatCardViolation(id, "BT13")).toBeUndefined();
    for (const id of ["BT14-033", "ST15-01", "P-123", "LM-051"]) expect(formatCardViolation(id, "BT13")).toBeDefined();
  });
  it.each([
    ["LM-001", "EX5", "BT15"],
    ["LM-020", "EX5", "BT15"],
    ["LM-021", "BT18", "EX8"],
    ["LM-038", "BT18", "EX8"],
    ["LM-039", "BT20", "BT21"],
    ["LM-044", "BT20", "BT21"],
    ["LM-045", "EX10", "BT23"],
    ["LM-050", "EX10", "BT23"],
    ["LM-051", "EX11", "AD1"],
    ["LM-056", "EX11", "AD1"],
    ["LM-057", "EX12", "BT26"],
    ["LM-062", "EX12", "BT26"],
  ] as const)("includes %s only after its own English product becomes available", (cardId, before, after) => {
    expect(formatCardViolation(cardId, before)).toContain("card pool");
    expect(formatCardViolation(cardId, after)).toBeUndefined();
    expect(formatCardViolation(cardId, `${after}:unlimited`)).toBeUndefined();
    expect(formatCardViolation(cardId, "EX13")).toBeUndefined();
  });
  it("keeps later LM products outside the EX13 pool", () => {
    for (const cardId of ["LM-063", "LM-068"]) {
      expect(formatCardViolation(cardId, "EX13")).toContain("EX13 card pool");
      expect(formatCardViolation(cardId, "EX13:unlimited")).toContain("EX13 card pool");
    }
    expect(formatCardViolation("LM-051", "EX13:pauper")).toContain("C/U");
  });
  it("uses the historical restrictions, including restrictions later lifted", () => {
    expect(formatCopyLimit("BT13-012", "BT13")).toBe(4);
    expect(formatCopyLimit("BT13-012", "standard")).toBe(1);
    expect(formatCopyLimit("BT6-015", "BT13")).toBe(1);
    expect(formatCopyLimit("BT6-015", "BT6")).toBe(4);
    expect(formatCopyLimit("BT7-072", "BT7")).toBe(4);
    expect(formatCopyLimit("BT7-072", "BT8")).toBe(1);
    expect(formatCopyLimit("BT6-015", "BT14")).toBe(4);
    expect(formatCopyLimit("BT5-109", "BT13")).toBe(0);
    expect(formatCopyLimit("BT5-109", "unlimited")).toBe(4);
    expect(formatPairViolations(["EX2-007", "EX7-064"], "BT13")).toEqual([]);
    expect(formatPairViolations(["EX2-007", "EX7-064"], "standard")).toHaveLength(1);
    expect(formatPairViolations(["EX5-065", "BT13-102"], "EX5")).toHaveLength(1);
    expect(formatPairViolations(["EX5-065", "BT13-102"], "BT13")).toHaveLength(0);
    expect(formatPairViolations(["EX5-065", "BT13-102"], "standard")).toHaveLength(0);
  });
  it("Pauper uses base C/U rarity for main cards and eggs and retains printed limits", () => {
    expect(formatCardViolation("BT1-009", "pauper")).toBeUndefined();
    expect(formatCardViolation("BT1-002", "pauper")).toBeUndefined();
    expect(formatCardViolation("BT1-025", "pauper")).toContain("C/U");
    expect(formatCopyLimit("BT6-085", "pauper")).toBe(50);
    expect(formatCopyLimit("BT1-010", "unlimited")).toBe(4);
    const deck = { mainDeck: Array<string>(50).fill("BT6-085"), eggDeck: ["BT1-002"] };
    expect(deckLegality(deck, { format: "pauper" }).legal).toBe(true);
    expect(deckLegality({ ...deck, eggDeck: ["BT1-025"] }, { format: "pauper" }).legal).toBe(false);
  });
  it("combines every dated set with independent rules and rejects malformed combinations", () => {
    for (const set of historicalDeckFormats()) {
      for (const rules of ["standard", "pauper", "unlimited"] as const) {
        const format = createDeckFormat(set, rules);
        expect(isDeckFormat(format)).toBe(true);
        expect(deckFormatSettings(format)).toEqual({ set, rules });
      }
    }
    expect(createDeckFormat("all", "pauper")).toBe("pauper");
    for (const format of ["BT13:standard", "BT13:invalid", "BT13:pauper:unlimited", "BT999:unlimited", "LM:pauper"])
      expect(isDeckFormat(format)).toBe(false);
  });
  it("BT13 Pauper combines historical restrictions, rarity and card-pool limits", () => {
    expect(formatCardViolation("BT13-012", "BT13:pauper")).toBeUndefined();
    expect(formatCopyLimit("BT13-012", "BT13:pauper")).toBe(4);
    expect(formatCardViolation("BT1-025", "BT13:pauper")).toContain("C/U");
    expect(formatCardViolation("BT14-033", "BT13:pauper")).toBeDefined();
    expect(formatPairViolations(["EX5-065", "BT13-102"], "EX5:pauper")).toHaveLength(1);
  });
  it("set Unlimited lifts bans while retaining the historical pool and printed limits", () => {
    expect(formatCopyLimit("BT5-109", "BT13:unlimited")).toBe(4);
    expect(formatCardViolation("BT5-109", "BT13:unlimited")).toBeUndefined();
    expect(formatCardViolation("BT14-033", "BT13:unlimited")).toContain("BT13 card pool");
    expect(formatCopyLimit("BT6-085", "BT13:unlimited")).toBe(50);
    expect(formatPairViolations(["EX5-065", "BT13-102"], "EX5:unlimited")).toEqual([]);
  });
});
