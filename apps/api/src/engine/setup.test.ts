import { describe, it, expect } from "vitest";
import { OPENING_HAND_SIZE } from "@aegis/shared/rules/OPENING_HAND_SIZE";
import { SECURITY_STACK_SIZE } from "@aegis/shared/rules/SECURITY_STACK_SIZE";
import { ArraySchema } from "@colyseus/schema";
import { CardInstance, GameState, type Seat } from "@aegis/shared";
import {
  makeRng,
  seatSeed,
  shuffleInPlace,
  buildPlayerState,
  shuffleDecks,
  dealOpeningHand,
  mulliganRedraw,
  setSecurityStack,
  runSetup,
  finalizeSecurity,
  type Decklist,
} from "./setup.js";
import { RED_DECK, BLUE_DECK } from "./testDecks.js";

/**
 * Unit coverage for the deck-and-setup primitives: a seeded, reproducible shuffle;
 * the rulebook security-stack ordering (§5-2-1-6); mulligan idempotency; and the full
 * runSetup deal. These exercise the mechanics in isolation from the engine's async
 * orchestration (covered in startMatch.test.ts).
 */

function emptyState(): GameState {
  const state = new GameState();
  state.players = new ArraySchema();
  return state;
}

describe("makeRng / shuffleInPlace (deterministic)", () => {
  it("yields the same sequence for the same seed", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
    for (const x of seqA) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("derives distinct sub-seeds per seat", () => {
    expect(seatSeed(7, 0)).not.toBe(seatSeed(7, 1));
  });

  it("shuffles deterministically and preserves the multiset", () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const a = shuffleInPlace([...items], makeRng(99));
    const b = shuffleInPlace([...items], makeRng(99));
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(items);
  });
});

describe("setSecurityStack (§5-2-1-6 ordering)", () => {
  it("places the deck top at the BOTTOM of the security stack", () => {
    const player = buildPlayerState(0, "s", "P", { mainDeck: [], eggDeck: [] });
    // Build a known deck order: top -> ... so the top card is index 0.
    player.deck = new ArraySchema<CardInstance>();
    for (let i = 0; i < 8; i += 1) {
      const card = new CardInstance();
      card.instanceId = `c${i}`;
      card.cardId = "BT1-009";
      card.ownerSeat = 0;
      player.deck.push(card); // deck[0] is the current top
    }
    const deckTopId = player.deck[0]!.instanceId;

    setSecurityStack(player);

    expect(player.security.length).toBe(SECURITY_STACK_SIZE);
    // security[0] is the TOP of the stack; the deck's top card must be the BOTTOM.
    expect(player.security[player.security.length - 1]!.instanceId).toBe(deckTopId);
    // The 5 taken cards left the deck (8 - 5 = 3 remain).
    expect(player.deck.length).toBe(3);
  });
});

describe("dealOpeningHand / mulliganRedraw", () => {
  function freshPlayer(deck: Decklist) {
    const player = buildPlayerState(0, "s", "P", deck);
    shuffleDecks(player, makeRng(seatSeed(1, 0)));
    return player;
  }

  it("deals 5 cards to the hand from the deck top", () => {
    const player = freshPlayer(RED_DECK);
    const deckBefore = player.deck.length;
    dealOpeningHand(player);
    expect(player.hand.length).toBe(OPENING_HAND_SIZE);
    expect(player.deck.length).toBe(deckBefore - OPENING_HAND_SIZE);
  });

  it("redraws a fresh hand and marks hasMulliganed (idempotent)", () => {
    const player = freshPlayer(RED_DECK);
    dealOpeningHand(player);
    const totalBefore = player.deck.length + player.hand.length;

    mulliganRedraw(player, makeRng(seatSeed(1, 0)));
    expect(player.hasMulliganed).toBe(true);
    expect(player.hand.length).toBe(OPENING_HAND_SIZE);
    // No cards were created or lost in the redraw.
    expect(player.deck.length + player.hand.length).toBe(totalBefore);

    // A second redraw is a no-op (each player may redraw only once).
    const handAfterFirst = player.hand.map((c) => c.instanceId);
    mulliganRedraw(player, makeRng(seatSeed(1, 0)));
    expect(player.hand.map((c) => c.instanceId)).toEqual(handAfterFirst);
  });

  it("re-identifies exposed hand cards before they can return as hidden security, reproducibly", () => {
    function redraw(seed: number) {
      const player = freshPlayer(RED_DECK);
      dealOpeningHand(player);
      const oldIds = new Set(player.hand.map((card) => card.instanceId));
      const before = [...player.deck, ...player.hand].map((card) => `${card.cardId}:${card.artId}`).sort();
      mulliganRedraw(player, makeRng(seed));
      setSecurityStack(player);
      const after = [...player.deck, ...player.hand, ...player.security];
      return { oldIds, before, after };
    }

    const first = redraw(137);
    const second = redraw(137);
    expect(first.after.map((card) => `${card.cardId}:${card.artId}`).sort()).toEqual(first.before);
    expect(first.after.map((card) => card.instanceId)).toEqual(second.after.map((card) => card.instanceId));
    expect(new Set(first.after.map((card) => card.instanceId)).size).toBe(first.after.length);
    expect(first.after.some((card) => first.oldIds.has(card.instanceId))).toBe(false);
  });

  it("keeps replacement IDs unique even when the injected RNG repeats", () => {
    const player = freshPlayer(RED_DECK);
    dealOpeningHand(player);
    mulliganRedraw(player, () => 0);
    const ids = [...player.deck, ...player.hand].map((card) => card.instanceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("narrates each pile it randomizes, so the client never infers a shuffle", () => {
    const player = buildPlayerState(0, "s", "P", RED_DECK);
    const shuffled: string[] = [];
    shuffleDecks(player, makeRng(seatSeed(1, 0)), (deck) => shuffled.push(deck));
    expect(shuffled).toEqual(["deck", "eggDeck"]);
  });

  it("narrates the mulligan reshuffle through the same hook", () => {
    const player = freshPlayer(RED_DECK);
    dealOpeningHand(player);
    const shuffled: string[] = [];
    mulliganRedraw(player, makeRng(seatSeed(1, 0)), (deck) => shuffled.push(deck));
    expect(shuffled).toEqual(["deck", "eggDeck"]);
  });

  it("narrates nothing for a mulligan the player already spent", () => {
    const player = freshPlayer(RED_DECK);
    dealOpeningHand(player);
    mulliganRedraw(player, makeRng(seatSeed(1, 0)));
    const shuffled: string[] = [];
    mulliganRedraw(player, makeRng(seatSeed(1, 0)), (deck) => shuffled.push(deck));
    expect(shuffled).toEqual([]);
  });
});

describe("runSetup / finalizeSecurity (full deal)", () => {
  it("builds both players, deals hands, sets memory and first player", () => {
    const state = emptyState();
    const result = runSetup(state, {
      seats: [
        { sessionId: "a", displayName: "Red", deck: { ...RED_DECK } },
        { sessionId: "b", displayName: "Blue", deck: { ...BLUE_DECK } },
      ],
      firstSeat: 1 as Seat,
      seed: 7,
    });

    for (const seat of [0, 1] as const) {
      const player = state.players[seat]!;
      expect(player.hand.length).toBe(OPENING_HAND_SIZE);
      expect(player.eggDeck.length).toBe(5);
      expect(player.security.length).toBe(0); // security set only by finalizeSecurity
    }
    expect(state.turnSeat).toBe(1);
    expect(state.memory).toBe(0);
    expect(state.isFirstPlayersFirstTurn).toBe(true);

    // The per-seat RNG is returned so a later mulligan reshuffles on the same stream.
    expect(typeof result.rngForSeat(0)).toBe("function");

    finalizeSecurity(state);
    for (const seat of [0, 1] as const) {
      expect(state.players[seat]!.security.length).toBe(SECURITY_STACK_SIZE);
    }
  });

  it("gives each seat unique instance ids (no collisions across the match)", () => {
    const state = emptyState();
    runSetup(state, {
      seats: [
        { sessionId: "a", displayName: "Red", deck: { ...RED_DECK } },
        { sessionId: "b", displayName: "Blue", deck: { ...BLUE_DECK } },
      ],
      firstSeat: 0,
      seed: 1,
    });
    finalizeSecurity(state);

    const ids = new Set<string>();
    for (const seat of [0, 1] as const) {
      const p = state.players[seat]!;
      for (const zone of [p.deck, p.hand, p.security, p.eggDeck]) {
        for (const card of zone) {
          expect(ids.has(card.instanceId), `duplicate ${card.instanceId}`).toBe(false);
          ids.add(card.instanceId);
        }
      }
    }
  });
});

describe("physical printing identity", () => {
  it("retains each copy's art while shuffling, drawing, redrawing and setting security", () => {
    const player = buildPlayerState(0, "s", "Arts", {
      mainDeck: Array.from({ length: 20 }, () => "AD1-001"),
      eggDeck: ["AD1-001"],
      mainDeckArts: Array.from({ length: 20 }, (_, index) => (index % 2 ? "AD1-001_P1" : "AD1-001")),
      eggDeckArts: ["AD1-002_P1"],
    });
    const expected = [...player.deck].map((card) => `${card.cardId}:${card.artId}`).sort();
    expect(player.eggDeck[0]!.artId).toBe("AD1-001");
    shuffleDecks(player, makeRng(123));
    dealOpeningHand(player);
    mulliganRedraw(player, makeRng(321));
    setSecurityStack(player);
    const cards = [...player.deck, ...player.hand, ...player.security];
    expect(cards).toHaveLength(20);
    expect(cards.map((card) => `${card.cardId}:${card.artId}`).sort()).toEqual(expected);
  });
});
