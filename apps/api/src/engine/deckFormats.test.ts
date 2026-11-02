import { describe, expect, it } from "vitest";
import { allCards, CardKind, formatCopyLimit, formatCardViolation, type DeckFormat } from "@aegis/shared";
import { validateDecklist } from "./deckValidation.js";
import { playableBotDeck } from "./botDeck.js";

function deckFor(format: DeckFormat, first?: string) {
  const mainDeck: string[] = first ? [first] : [];
  for (const card of allCards()) {
    if (formatCardViolation(card.cardId, format) || card.kinds.includes(CardKind.DigiEgg) || card.cardId === first)
      continue;
    mainDeck.push(
      ...Array<string>(Math.min(formatCopyLimit(card.cardId, format), 50 - mainDeck.length)).fill(card.cardId),
    );
    if (mainDeck.length === 50) break;
  }
  return { mainDeck, eggDeck: [] as string[] };
}

describe("authoritative format validation", () => {
  it("BT13 rejects later cards even when beta and Unlimited flags are supplied", () => {
    const deck = deckFor("BT13");
    expect(validateDecklist(deck, { format: "BT13" })).toEqual({ ok: true });
    deck.mainDeck[0] = "BT14-033";
    expect(validateDecklist(deck, { format: "BT13", betaBattleMode: true, unlimited: true })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("BT13 card pool"),
    });
  });
  it("accepts released limited cards in historical decks while rejecting later products", () => {
    expect(validateDecklist(deckFor("EX13", "LM-051"), { format: "EX13" })).toEqual({ ok: true });
    expect(validateDecklist(deckFor("EX13", "LM-063"), { format: "EX13", betaBattleMode: true })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("EX13 card pool"),
    });
    expect(validateDecklist(deckFor("BT13", "LM-051"), { format: "BT13", betaBattleMode: true })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("BT13 card pool"),
    });
  });
  it("Pauper checks main and egg rarities", () => {
    const deck = deckFor("pauper");
    expect(validateDecklist(deck, { format: "pauper" })).toEqual({ ok: true });
    deck.mainDeck[0] = "BT1-025";
    expect(validateDecklist(deck, { format: "pauper" })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("C/U"),
    });
  });
  it("a card legal at BT13's release uses its old copy cap", () => {
    const deck = deckFor("BT13");
    deck.mainDeck.splice(0, 4, ...Array<string>(4).fill("BT13-012"));
    expect(validateDecklist(deck, { format: "BT13" })).toEqual({ ok: true });
    expect(validateDecklist(deck)).toMatchObject({ ok: false });
  });
  it.each(["BT13", "pauper", "unlimited", "BT13:pauper", "BT13:unlimited"] as const)(
    "selects a legal bot deck for %s even when the requested preset is incompatible",
    (format) => {
      expect(validateDecklist(playableBotDeck("missing-preset", format), { format })).toEqual({ ok: true });
    },
  );
  it("set Unlimited accepts historical banned cards but never later cards", () => {
    const deck = deckFor("BT13:unlimited", "BT5-109");
    expect(validateDecklist(deck, { format: "BT13:unlimited" })).toEqual({ ok: true });
    expect(validateDecklist(deck, { format: "BT13" })).toMatchObject({ ok: false });
    deck.mainDeck[0] = "BT14-033";
    expect(validateDecklist(deck, { format: "BT13:unlimited", betaBattleMode: true, unlimited: true })).toMatchObject({
      ok: false,
    });
  });
});
