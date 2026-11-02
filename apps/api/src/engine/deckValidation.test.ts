import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { GameState, bannedPairViolations, type Seat } from "@aegis/shared";
import { GameEngine, type GameEngineHooks } from "./GameEngine.js";
import { validateDecklist } from "./deckValidation.js";
import { RED_DECK } from "./testDecks.js";
import type { Decklist } from "./setup.js";

/**
 * Server-authoritative deck-legality gate (BLK-05.2, V5 input validation). The
 * client deck (`options.deck`) is attacker-controlled; the server must reject an
 * illegal deck on join and never stage it. RED_DECK is a known-legal 50+5 deck with
 * no banlisted card — the base fixture each illegal case mutates.
 */

// The beta-only cases below use real EX13 / P-245 cards, which stop being beta-only on their
// street dates (2026-10-02 / 2026-10-01). Pin the clock so the proofs do not expire with them.
const BEFORE_EX13_RELEASE = new Date("2026-09-11T12:00:00Z");
beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: BEFORE_EX13_RELEASE }));
afterEach(() => vi.useRealTimers());

function clone(deck: Decklist): Decklist {
  return { mainDeck: [...deck.mainDeck], eggDeck: [...deck.eggDeck] };
}

function makeEngine(): { engine: GameEngine; state: GameState } {
  const state = new GameState();
  const hooks: GameEngineHooks = {
    seed: 1,
    emit: () => {},
    requestDecision: () => {},
  };
  return { engine: new GameEngine(state, hooks), state };
}

describe("validateDecklist (decklist + banlist legality)", () => {
  it("accepts a legal 50-main / 5-egg deck with no banlisted cards", () => {
    expect(validateDecklist(RED_DECK)).toEqual({ ok: true });
  });

  it("rejects a main deck whose size is not exactly 50", () => {
    const tooSmall = clone(RED_DECK);
    tooSmall.mainDeck.pop();
    expect(validateDecklist(tooSmall).ok).toBe(false);

    const tooLarge = clone(RED_DECK);
    tooLarge.mainDeck.push("BT1-010");
    expect(validateDecklist(tooLarge).ok).toBe(false);
  });

  it("rejects an egg deck with more than 5 cards", () => {
    const overEgg = clone(RED_DECK);
    overEgg.eggDeck.push("BT1-001");
    expect(validateDecklist(overEgg).ok).toBe(false);
  });

  it("rejects more than 4 copies of an unrestricted card (over-copy)", () => {
    // Make 5 copies of BT1-009 by dropping one BT1-090 (Option) to keep size 50.
    const overCopy = clone(RED_DECK);
    const dropIndex = overCopy.mainDeck.indexOf("BT1-090");
    overCopy.mainDeck.splice(dropIndex, 1);
    overCopy.mainDeck.push("BT1-009"); // now 5x BT1-009, still 50 total
    expect(overCopy.mainDeck.length).toBe(50);
    expect(validateDecklist(overCopy).ok).toBe(false);
  });

  it("shares one copy budget across printings that share a card number (RB1-004 + P-009)", () => {
    // Replace the four BT1-010 and one BT1-011 with 2x RB1-004 + 3x P-009: five copies of "P-009".
    const shared = clone(RED_DECK);
    for (const [removed, replacement] of [
      ["BT1-010", "RB1-004"],
      ["BT1-010", "RB1-004"],
      ["BT1-010", "P-009"],
      ["BT1-010", "P-009"],
      ["BT1-011", "P-009"],
    ]) {
      shared.mainDeck.splice(shared.mainDeck.indexOf(removed!), 1, replacement!);
    }
    expect(shared.mainDeck.length).toBe(50);
    const verdict = validateDecklist(shared);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toMatch(/shared card number/);
  });

  it("accepts four copies split across printings that share a card number", () => {
    const shared = clone(RED_DECK);
    for (const replacement of ["RB1-004", "RB1-004", "P-009", "P-009"]) {
      shared.mainDeck.splice(shared.mainDeck.indexOf("BT1-010"), 1, replacement);
    }
    expect(validateDecklist(shared)).toEqual({ ok: true });
  });

  it("GitHub #5202: Unlimited lifts banlist restrictions while retaining printed copy limits, sizes and card-number budgets", () => {
    const deck = clone(RED_DECK);
    deck.mainDeck.splice(0, 4, ...Array<string>(4).fill("BT5-109"));
    expect(validateDecklist(deck).ok).toBe(false);
    expect(validateDecklist(deck, { unlimited: true })).toEqual({ ok: true });
    deck.mainDeck[4] = "BT5-109";
    expect(validateDecklist(deck, { unlimited: true })).toMatchObject({ ok: false });
    deck.mainDeck.pop();
    expect(validateDecklist(deck, { unlimited: true }).ok).toBe(false);
    const shared = clone(RED_DECK);
    shared.mainDeck.splice(0, 5, "RB1-004", "RB1-004", "P-009", "P-009", "P-009");
    expect(validateDecklist(shared, { unlimited: true })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("shared card number"),
    });
    const pair = clone(RED_DECK);
    pair.eggDeck = ["EX2-007"];
    pair.mainDeck[0] = "EX7-064";
    expect(validateDecklist(pair).ok).toBe(false);
    expect(validateDecklist(pair, { unlimited: true })).toEqual({ ok: true });
  });
  it("rejects a deck containing a banlisted single card (banned, count 0)", () => {
    // BT5-109 is banned under the current banlist (effective cap 0).
    const banned = clone(RED_DECK);
    const dropIndex = banned.mainDeck.indexOf("BT1-090");
    banned.mainDeck.splice(dropIndex, 1);
    banned.mainDeck.push("BT5-109");
    expect(banned.mainDeck.length).toBe(50);
    expect(validateDecklist(banned).ok).toBe(false);
  });

  it("rejects a deck exceeding a restricted card's lowered cap (BT2-047 cap 1)", () => {
    const overRestricted = clone(RED_DECK);
    const i1 = overRestricted.mainDeck.indexOf("BT1-090");
    overRestricted.mainDeck.splice(i1, 1);
    overRestricted.mainDeck.push("BT2-047");
    const i2 = overRestricted.mainDeck.indexOf("BT1-085");
    overRestricted.mainDeck.splice(i2, 1);
    overRestricted.mainDeck.push("BT2-047"); // 2 copies, cap is 1
    expect(overRestricted.mainDeck.length).toBe(50);
    expect(validateDecklist(overRestricted).ok).toBe(false);
  });

  it("accepts a banned-pair card without its partner", () => {
    // EX2-007 (Mother D-Reaper) is a Digi-Egg, so it belongs in the egg deck.
    const lonePairCard = clone(RED_DECK);
    lonePairCard.eggDeck = [...lonePairCard.eggDeck.slice(0, 4), "EX2-007"];
    expect(validateDecklist(lonePairCard)).toEqual({ ok: true });
  });

  it("reports a banned pair only when both cards share the deck", () => {
    // The explicit dates cover the rule before and after it takes effect.
    expect(bannedPairViolations(["EX2-007"], "2025-03-28")).toEqual([]);
    expect(bannedPairViolations(["EX2-007", "EX7-064"], "2025-03-28")).toEqual([["EX2-007", "EX7-064"]]);
    expect(bannedPairViolations(["EX2-007", "EX7-064"], "2025-03-27")).toEqual([]);
  });

  it("rejects a Digi-Egg in the main deck", () => {
    const withEgg = clone(RED_DECK);
    const dropIndex = withEgg.mainDeck.indexOf("BT1-090");
    withEgg.mainDeck.splice(dropIndex, 1);
    withEgg.mainDeck.push("BT1-001"); // Yokomon (Lv.2 Digi-Egg) in main deck
    expect(validateDecklist(withEgg).ok).toBe(false);
  });

  it("rejects a non-Digi-Egg in the egg deck", () => {
    const withNonEgg = clone(RED_DECK);
    withNonEgg.eggDeck.push("BT1-009"); // Monodramon (Lv.3 Digimon) in egg deck
    expect(validateDecklist(withNonEgg).ok).toBe(false);
  });

  it("accepts an egg deck with 0 cards", () => {
    const zeroEgg = clone(RED_DECK);
    zeroEgg.eggDeck = [];
    expect(validateDecklist(zeroEgg)).toEqual({ ok: true });
  });

  it("rejects an unknown / fabricated cardId", () => {
    const unknown = clone(RED_DECK);
    const dropIndex = unknown.mainDeck.indexOf("BT1-090");
    unknown.mainDeck.splice(dropIndex, 1);
    unknown.mainDeck.push("ZZ99-999");
    expect(validateDecklist(unknown).ok).toBe(false);
  });

  it("accepts a card from any release block", () => {
    const modernSet = clone(RED_DECK);
    const dropIndex = modernSet.mainDeck.indexOf("BT1-090");
    modernSet.mainDeck.splice(dropIndex, 1);
    modernSet.mainDeck.push("BT26-010");

    expect(validateDecklist(modernSet)).toEqual({ ok: true });
  });

  it("rejects an unreleased (beta-only) card outside beta battle mode", () => {
    const withBeta = clone(RED_DECK);
    const dropIndex = withBeta.mainDeck.indexOf("BT1-090");
    withBeta.mainDeck.splice(dropIndex, 1);
    withBeta.mainDeck.push("EX13-007");

    expect(validateDecklist(withBeta).ok).toBe(false);
    expect(validateDecklist(withBeta, { betaBattleMode: false }).ok).toBe(false);
  });

  it("accepts an unreleased (beta-only) card in beta battle mode", () => {
    const withBeta = clone(RED_DECK);
    const dropIndex = withBeta.mainDeck.indexOf("BT1-090");
    withBeta.mainDeck.splice(dropIndex, 1);
    withBeta.mainDeck.push("EX13-007");

    expect(validateDecklist(withBeta, { betaBattleMode: true })).toEqual({ ok: true });
  });

  it("rejects an unreleased egg-deck card outside beta battle mode", () => {
    const withBetaEgg = clone(RED_DECK);
    withBetaEgg.eggDeck = [...withBetaEgg.eggDeck.slice(0, 4), "P-245"];

    expect(validateDecklist(withBetaEgg).ok).toBe(false);
    expect(validateDecklist(withBetaEgg, { betaBattleMode: true })).toEqual({ ok: true });
  });
});

describe("seatPlayer rejects an illegal deck on join (server-authoritative)", () => {
  const illegalSeat = 0 as Seat;

  it("throws and stages nothing when the deck is over-copy", () => {
    const { engine, state } = makeEngine();
    const overCopy = clone(RED_DECK);
    const dropIndex = overCopy.mainDeck.indexOf("BT1-090");
    overCopy.mainDeck.splice(dropIndex, 1);
    overCopy.mainDeck.push("BT1-009"); // 5x BT1-009

    expect(() => engine.seatPlayer(illegalSeat, "attacker", { displayName: "X", deck: overCopy })).toThrow();
    // The seat was never staged: PlayerState is not populated.
    expect(state.players[illegalSeat]).toBeUndefined();
  });

  it("throws and stages nothing when the deck contains a banned card", () => {
    const { engine, state } = makeEngine();
    const banned = clone(RED_DECK);
    const dropIndex = banned.mainDeck.indexOf("BT1-090");
    banned.mainDeck.splice(dropIndex, 1);
    banned.mainDeck.push("BT5-109");

    expect(() => engine.seatPlayer(illegalSeat, "attacker", { displayName: "X", deck: banned })).toThrow();
    expect(state.players[illegalSeat]).toBeUndefined();
  });

  it("seats a legal deck (does not throw, populates the seat)", () => {
    const { engine, state } = makeEngine();
    expect(() => engine.seatPlayer(illegalSeat, "honest", { displayName: "Red", deck: clone(RED_DECK) })).not.toThrow();
    expect(state.players[illegalSeat]).toBeDefined();
  });

  it("throws on an unreleased card unless betaBattleMode is set", () => {
    const { engine, state } = makeEngine();
    const withBeta = clone(RED_DECK);
    const dropIndex = withBeta.mainDeck.indexOf("BT1-090");
    withBeta.mainDeck.splice(dropIndex, 1);
    withBeta.mainDeck.push("EX13-007");

    expect(() => engine.seatPlayer(illegalSeat, "attacker", { displayName: "X", deck: withBeta })).toThrow(
      "illegal deck",
    );
    expect(state.players[illegalSeat]).toBeUndefined();

    expect(() =>
      engine.seatPlayer(illegalSeat, "attacker", { displayName: "X", deck: withBeta, betaBattleMode: true }),
    ).not.toThrow();
    expect(state.players[illegalSeat]).toBeDefined();
  });
});

describe("frozen tournament restrictions", () => {
  it("uses the saved banlist instead of current restrictions and retains printed copy limits", () => {
    const deck = clone(RED_DECK);
    deck.mainDeck.splice(0, 4, ...Array<string>(4).fill("BT5-109"));
    expect(validateDecklist(deck).ok).toBe(false);
    expect(validateDecklist(deck, { banlistCards: [] })).toEqual({ ok: true });
    expect(
      validateDecklist(deck, { banlistCards: [{ cardId: "BT5-109", status: "restricted", allowedCopies: 1 }] }).ok,
    ).toBe(false);
    deck.mainDeck[4] = "BT5-109";
    expect(validateDecklist(deck, { banlistCards: [] }).ok).toBe(false);
  });

  it("applies only the saved pair topology", () => {
    const deck = clone(RED_DECK);
    deck.eggDeck = ["EX2-007"];
    deck.mainDeck[0] = "EX7-064";
    expect(validateDecklist(deck).ok).toBe(false);
    expect(validateDecklist(deck, { banlistCards: [] })).toEqual({ ok: true });
    expect(
      validateDecklist(deck, {
        banlistCards: [{ cardId: "EX2-007", status: "banned_pair", allowedCopies: 4, pairPartnerIds: ["EX7-064"] }],
      }).ok,
    ).toBe(false);
  });
});
