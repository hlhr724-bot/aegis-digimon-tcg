import type { TournamentBanlistCard } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { RED_DECK } from "../../engine/testDecks.js";
import { type CompetitiveDeck, validateCompetitiveDeck } from "./deckLegality.js";

const LEGAL: CompetitiveDeck = { mainDeck: RED_DECK.mainDeck, eggDeck: RED_DECK.eggDeck };
const FIRST_MAIN_CARD = LEGAL.mainDeck[0]!;
const FIRST_EGG_CARD = LEGAL.eggDeck[0]!;

// Real banned pair from the published banlist: Chaosmon: Valdur Arm may not share a deck with
// either of its two partners.
const PAIR_ANCHOR = "BT20-037";
const PAIR_PARTNER = "BT17-035";
// An unrelated card, used to prove the snapshot's topology wins over the live table's.
const OTHER_CARD = "BT20-038";

function pairEntry(cardId: string, pairPartnerIds: string[]): TournamentBanlistCard {
  return { cardId, status: "banned_pair", allowedCopies: 4, pairPartnerIds };
}

/** A deck holding both members of the live banned pair. */
function pairedDeck(): CompetitiveDeck {
  return { mainDeck: [PAIR_ANCHOR, PAIR_PARTNER, ...LEGAL.mainDeck.slice(2)], eggDeck: LEGAL.eggDeck };
}

// Vemmon's printed text allows up to 50 copies, which makes it the one card that can pad a main
// deck back to exactly 50 without introducing a copy-limit violation of its own.
const FILLER = "BT11-061";

function deckWithCopies(count: number, cardId: string): CompetitiveDeck {
  return {
    mainDeck: [...Array<string>(count).fill(cardId), ...Array<string>(50 - count).fill(FILLER)],
    eggDeck: LEGAL.eggDeck,
  };
}

function banlist(...cards: TournamentBanlistCard[]): TournamentBanlistCard[] {
  return cards;
}

describe("validateCompetitiveDeck", () => {
  it("accepts a legal deck under the mode-none policy, which is an empty snapshot", () => {
    expect(validateCompetitiveDeck(LEGAL, [])).toEqual({ legal: true, violations: [] });
    expect(validateCompetitiveDeck(LEGAL)).toEqual({ legal: true, violations: [] });
  });

  it("rejects a main deck that is not exactly 50 cards", () => {
    expect(validateCompetitiveDeck({ ...LEGAL, mainDeck: LEGAL.mainDeck.slice(0, 49) }).violations).toContainEqual({
      kind: "main_deck_size",
      size: 49,
      required: 50,
    });
  });

  it("rejects an egg deck over five cards", () => {
    const eggDeck = [...LEGAL.eggDeck, ...LEGAL.eggDeck].slice(0, 6);
    expect(validateCompetitiveDeck({ ...LEGAL, eggDeck }).violations).toContainEqual({
      kind: "egg_deck_size",
      size: 6,
      max: 5,
    });
  });

  it("rejects a Digi-Egg in the main deck and a main-deck card in the egg deck", () => {
    const swapped = validateCompetitiveDeck({
      mainDeck: [FIRST_EGG_CARD, ...LEGAL.mainDeck.slice(1)],
      eggDeck: [FIRST_MAIN_CARD],
    });
    expect(swapped.violations).toContainEqual({ kind: "wrong_deck", cardId: FIRST_EGG_CARD, belongsIn: "egg" });
    expect(swapped.violations).toContainEqual({ kind: "wrong_deck", cardId: FIRST_MAIN_CARD, belongsIn: "main" });
  });

  it("rejects an unknown card id", () => {
    expect(
      validateCompetitiveDeck({ mainDeck: ["NOT-A-CARD", ...LEGAL.mainDeck.slice(1)], eggDeck: LEGAL.eggDeck })
        .violations,
    ).toContainEqual({ kind: "unknown_card", cardId: "NOT-A-CARD" });
  });

  it("rejects a banned card even at a single copy", () => {
    const deck = deckWithCopies(1, FIRST_MAIN_CARD);
    const result = validateCompetitiveDeck(
      deck,
      banlist({ cardId: FIRST_MAIN_CARD, status: "banned", allowedCopies: 0 }),
    );
    expect(result.legal).toBe(false);
    expect(result.violations).toContainEqual({ kind: "banned", cardId: FIRST_MAIN_CARD });
  });

  it("caps a restricted card at the snapshot's allowedCopies", () => {
    const overCap = validateCompetitiveDeck(
      deckWithCopies(2, FIRST_MAIN_CARD),
      banlist({ cardId: FIRST_MAIN_CARD, status: "restricted", allowedCopies: 1 }),
    );
    expect(overCap.violations).toContainEqual({
      kind: "over_copy_limit",
      cardId: FIRST_MAIN_CARD,
      copies: 2,
      allowed: 1,
    });
    expect(
      validateCompetitiveDeck(
        deckWithCopies(1, FIRST_MAIN_CARD),
        banlist({ cardId: FIRST_MAIN_CARD, status: "restricted", allowedCopies: 1 }),
      ).legal,
    ).toBe(true);
  });

  it("still enforces the card's printed copy limit when the snapshot is empty", () => {
    expect(validateCompetitiveDeck(deckWithCopies(5, FIRST_MAIN_CARD), []).violations).toContainEqual({
      kind: "over_copy_limit",
      cardId: FIRST_MAIN_CARD,
      copies: 5,
      allowed: 4,
    });
  });

  it("rejects a banned pair only when both members are actually in the deck", () => {
    const snapshot = banlist(pairEntry(PAIR_ANCHOR, [PAIR_PARTNER]));
    const alone = { mainDeck: [PAIR_ANCHOR, ...LEGAL.mainDeck.slice(1)], eggDeck: LEGAL.eggDeck };
    expect(validateCompetitiveDeck(alone, snapshot).violations).not.toContainEqual(
      expect.objectContaining({ kind: "banned_pair" }),
    );
    expect(validateCompetitiveDeck(pairedDeck(), snapshot).violations).toContainEqual({
      kind: "banned_pair",
      cardId: PAIR_ANCHOR,
      conflictsWith: PAIR_PARTNER,
    });
  });

  it("catches the same banned pair when the snapshot names the partner instead of the anchor", () => {
    expect(
      validateCompetitiveDeck(pairedDeck(), banlist(pairEntry(PAIR_PARTNER, [PAIR_ANCHOR]))).violations,
    ).toContainEqual({ kind: "banned_pair", cardId: PAIR_PARTNER, conflictsWith: PAIR_ANCHOR });
  });

  it("ignores a banned pair the tournament's snapshot does not carry", () => {
    expect(validateCompetitiveDeck(pairedDeck(), []).violations).not.toContainEqual(
      expect.objectContaining({ kind: "banned_pair" }),
    );
  });

  it("enforces the snapshot's pair topology, not the live one", () => {
    // The live table pairs the anchor with PAIR_PARTNER. This frozen snapshot predates that and
    // pairs it with something else entirely, so the deck holding the live pair is legal here and
    // the deck holding the frozen pair is not.
    const frozen = banlist(pairEntry(PAIR_ANCHOR, [OTHER_CARD]));
    expect(validateCompetitiveDeck(pairedDeck(), frozen).violations).not.toContainEqual(
      expect.objectContaining({ kind: "banned_pair" }),
    );
    const frozenPairInDeck = {
      mainDeck: [PAIR_ANCHOR, OTHER_CARD, ...LEGAL.mainDeck.slice(2)],
      eggDeck: LEGAL.eggDeck,
    };
    expect(validateCompetitiveDeck(frozenPairInDeck, frozen).violations).toContainEqual({
      kind: "banned_pair",
      cardId: PAIR_ANCHOR,
      conflictsWith: OTHER_CARD,
    });
  });

  it("treats a pair entry with no partner list as constraining nothing", () => {
    expect(
      validateCompetitiveDeck(pairedDeck(), banlist({ cardId: PAIR_ANCHOR, status: "banned_pair", allowedCopies: 4 }))
        .violations,
    ).toEqual([]);
  });

  it("leaves a banned_pair card at its printed cap even when allowedCopies says zero", () => {
    // `allowedCopies` is meaningless for banned_pair — the card is legal alone at its printed
    // count, which is what the shared effectiveCopyLimit does too. Only the pair makes it illegal.
    const snapshot = banlist({ cardId: PAIR_ANCHOR, status: "banned_pair", allowedCopies: 0 });
    expect(validateCompetitiveDeck(deckWithCopies(4, PAIR_ANCHOR), snapshot).violations).toEqual([]);
    expect(validateCompetitiveDeck(deckWithCopies(5, PAIR_ANCHOR), snapshot).violations).toContainEqual({
      kind: "over_copy_limit",
      cardId: PAIR_ANCHOR,
      copies: 5,
      allowed: 4,
    });
  });
});

it("rejects shared card-number copies above the combined budget", () => {
  const mainDeck = [...LEGAL.mainDeck];
  mainDeck.splice(0, 5, "RB1-004", "RB1-004", "P-009", "P-009", "P-009");
  expect(validateCompetitiveDeck({ mainDeck, eggDeck: LEGAL.eggDeck }).violations).toContainEqual({
    kind: "over_copy_limit",
    cardId: "RB1-004",
    copies: 5,
    allowed: 4,
  });
});

it("rejects cards outside the event's historical pool", () => {
  const deck = { mainDeck: ["BT20-037", ...LEGAL.mainDeck.slice(1)], eggDeck: LEGAL.eggDeck };
  expect(validateCompetitiveDeck(deck, [], "BT10").violations).toContainEqual({
    kind: "outside_format",
    cardId: "BT20-037",
  });
});
