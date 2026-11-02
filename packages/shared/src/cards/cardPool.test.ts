import { getLimitedCardAvailability } from "#shared/cards/getLimitedCardAvailability";
import { describe, expect, it } from "vitest";
import { allCards, getCardDefinition } from "./registry.js";
import { isBetaOnlyCard, promoProductCardIds, releaseDateForCard, releaseDateForSet } from "./cardPool.js";

function card(cardId: string) {
  const definition = getCardDefinition(cardId);
  if (!definition) throw new Error(`Missing fixture card ${cardId}`);
  return definition;
}

describe("release dates", () => {
  it("resolves a product date for every non-promo set", () => {
    expect(releaseDateForSet("BT10")).toBe("2022-10-14");
    expect(releaseDateForSet("BT19")).toBe("2025-02-28");
    expect(releaseDateForSet("ZZ")).toBeUndefined();
  });

  it("uses promo release dates instead of treating every P card as one set", () => {
    expect(releaseDateForCard(card("P-077"))).toBe("2022-07-29");
    expect(releaseDateForCard(card("P-078"))).toBe("2022-07-29");
    expect(releaseDateForCard(card("P-082"))).toBe("2024-05-01");
  });

  it("derives the ST11 Special Entry Pack inventory from the promo product mapping", () => {
    expect(promoProductCardIds("ST11 Special Entry Pack")).toEqual(["P-065"]);
  });

  it("flags a card as beta-only exactly while its verified date is still in the future", () => {
    expect(isBetaOnlyCard(card("EX13-001"), "2026-09-11")).toBe(true);
    expect(isBetaOnlyCard(card("EX13-001"), "2026-10-02")).toBe(false);
    expect(isBetaOnlyCard(card("EX13-001"), "2026-10-03")).toBe(false);
    expect(isBetaOnlyCard(card("P-245"), "2026-09-11")).toBe(true);
    expect(isBetaOnlyCard(card("P-245"), "2026-10-01")).toBe(false);
    expect(isBetaOnlyCard(card("BT10-001"), "2022-10-14")).toBe(false);
    expect(isBetaOnlyCard(card("BT10-001"), "2026-09-11")).toBe(false);
  });

  it.each(["EX14-012", "EX14-054"])("keeps %s in beta until the EX14 release", (cardId) => {
    expect(releaseDateForCard(card(cardId))).toBe("2027-01-22");
    expect(isBetaOnlyCard(card(cardId), "2026-10-15")).toBe(true);
    expect(isBetaOnlyCard(card(cardId), "2027-01-21")).toBe(true);
    expect(isBetaOnlyCard(card(cardId), "2027-01-22")).toBe(false);
  });

  it("keeps each limited product behind its own release date", () => {
    expect(releaseDateForSet("LM")).toBeUndefined();
    expect(releaseDateForCard(card("LM-001"))).toBe("2024-02-16");
    expect(releaseDateForCard(card("LM-020"))).toBe("2024-02-16");
    expect(isBetaOnlyCard(card("LM-057"), "2026-08-27")).toBe(true);
    expect(isBetaOnlyCard(card("LM-057"), "2026-08-28")).toBe(false);
    expect(isBetaOnlyCard(card("LM-063"), "2026-10-14")).toBe(true);
    expect(isBetaOnlyCard(card("LM-068"), "2026-11-27")).toBe(false);
    expect(releaseDateForCard({ cardId: "LM-999", set: "LM" })).toBeUndefined();
  });

  it.each([
    ["LM-057", "2026-08-28", "2026-09-04"],
    ["LM-063", "2026-11-27", "2026-12-11"],
  ])("separates %s retail availability from its later tournament eligibility", (cardId, retailDate, legalDate) => {
    expect(isBetaOnlyCard(card(cardId), retailDate)).toBe(false);
    expect(getLimitedCardAvailability(cardId)?.legalDate).toBe(legalDate);
    expect(getLimitedCardAvailability(cardId)?.legalDate).not.toBe(releaseDateForCard(card(cardId)));
  });

  it("has release metadata for every non-token card in the registry", () => {
    const missing = allCards()
      .filter((definition) => !definition.isToken)
      .filter((definition) => releaseDateForCard(definition) === undefined)
      .map((definition) => definition.cardId);

    expect(missing).toEqual([]);
  });
});
