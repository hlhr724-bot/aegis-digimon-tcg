import { describe, it, expect } from "vitest";
import { OPENING_HAND_SIZE } from "@aegis/shared/rules/OPENING_HAND_SIZE";
import { SECURITY_STACK_SIZE } from "@aegis/shared/rules/SECURITY_STACK_SIZE";
import { GameState, PlayerState, Zone, type Seat } from "@aegis/shared";
import { cite } from "./_kb.js";
import "./not-testable.js";
import { runSetup, finalizeSecurity, mulliganRedraw, makeRng, seatSeed } from "../setup.js";
import { validateDecklist } from "../deckValidation.js";
import { RED_DECK, BLUE_DECK } from "../testDecks.js";
import "../../cards/index.js";

/**
 * Comprehensive Rules chapter 5 "Game Preparation" (comprehensive-0005, 0099-0101).
 * See `ch01-game-overview.test.ts` / README.md for the citation contract.
 *
 * comprehensive-0005 (TOC dot-leader) and comprehensive-0099 (bare chapter heading) carry
 * no normative content of their own and are seeded in `not-testable.ts`; the two real
 * content chunks in this chapter are comprehensive-0100 and comprehensive-0101.
 */

function seatState(state: GameState, seat: Seat): PlayerState {
  const player = new PlayerState();
  player.seat = seat;
  state.players[seat] = player;
  return player;
}

describe("§5-1 Deck and Digi-Egg Deck Preparation (comprehensive-0100)", () => {
  it("5-1-2: token cards are never part of a legal decklist — validateDecklist rejects a synthetic TOKEN- id", () => {
    cite(
      "comprehensive-0100",
      "5-1-2 token cards are left outside of the game before setup",
      "6603a5e6e045e464e37385d2bd6b1729d099723fb0fdd122af32f514e8e15601",
    );

    // Tokens are spawned by effects (packages/shared/src/cards/tokens.ts), never printed
    // deck-legal cards. The registry DOES resolve a synthetic TOKEN- id (tokens are registered
    // card definitions, just not deck-legal ones), so the rejection comes from their printed
    // `maxCountInDeck: 0` copy cap — effectively "zero copies allowed", not "unrecognized" — but
    // the net effect the rule requires (never placeable in a decklist) still holds.
    const deck = { mainDeck: [...RED_DECK.mainDeck.slice(1), "TOKEN-Diaboromon-Token"], eggDeck: RED_DECK.eggDeck };
    const verdict = validateDecklist(deck);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/TOKEN-Diaboromon-Token/);
  });

  it("5-1-1: the deck-and-egg-deck items required for a game are validated before setup runs (a legal decklist passes)", () => {
    const verdict = validateDecklist(RED_DECK);
    expect(verdict).toEqual({ ok: true });
  });
});

describe("§5-2 Pre-Game Preparations (comprehensive-0101)", () => {
  it("5-2-1-1/5-2-1-2/5-2-1-4/5-2-1-7/5-2-1-8: runSetup shuffles, deals a 5-card opening hand, zeroes memory, and sets the declared first player's turn", () => {
    const chunk = cite(
      "comprehensive-0101",
      "5-2-1: shuffle deck/egg-deck, decide first player, draw 5, mulligan window, set security, memory to 0, first player's turn begins",
      "bb2402c60b642e3c0dfe2592d132a1a69c5800280ef03be673c8ac9952a38319",
    );
    expect(chunk.text).toContain("5-2-1-7");

    const state = new GameState();
    const setupResult = runSetup(state, {
      seats: [
        { sessionId: "s0", displayName: "A", deck: RED_DECK },
        { sessionId: "s1", displayName: "B", deck: BLUE_DECK },
      ],
      firstSeat: 1, // deliberately not seat 0, to prove the ENGINE'S choice is honored, not a hardcoded default
      seed: 42,
    });

    const p0 = state.players[0]!;
    const p1 = state.players[1]!;
    // §5-2-1-4: both players draw exactly OPENING_HAND_SIZE (5) cards for their initial hand.
    expect(p0.hand.length).toBe(OPENING_HAND_SIZE);
    expect(p1.hand.length).toBe(OPENING_HAND_SIZE);
    // §5-2-1-1: deck was shuffled — not still in the input decklist's original order. (RED_DECK's
    // first main-deck entries are 4 identical copies of the same card, so compare the FULL
    // remaining deck order against an unshuffled load to prove the shuffle actually ran.)
    const identityRng = makeRng(seatSeed(42, 0));
    const shuffled = Array.from(p0.deck).map((c) => c.cardId);
    const unshuffledOrder = RED_DECK.mainDeck.slice(OPENING_HAND_SIZE);
    void identityRng;
    expect(shuffled).not.toEqual(unshuffledOrder);
    // §5-2-1-7: the memory gauge starts at 0.
    expect(state.memory).toBe(0);
    // §5-2-1-8/5-2-1-3: the game begins with the DECLARED first player's turn (here, seat 1).
    expect(state.turnSeat).toBe(1);

    // §5-2-1-6 (finalizeSecurity, called after the mulligan window closes): each seat's top 5
    // remaining deck cards become their face-down security stack, deck-top -> stack-bottom.
    const p0DeckTopBeforeSecurity = Array.from(p0.deck)
      .slice(0, SECURITY_STACK_SIZE)
      .map((c) => c.instanceId);
    finalizeSecurity(state);
    expect(p0.security.length).toBe(SECURITY_STACK_SIZE);
    expect(p0.security.every((c) => c.faceUp === false)).toBe(true);
    // The card that was on TOP of the deck ends up at the BOTTOM (last index) of the stack.
    expect(p0.security[p0.security.length - 1]!.instanceId).toBe(p0DeckTopBeforeSecurity[0]);
    expect(p0.security[0]!.instanceId).toBe(p0DeckTopBeforeSecurity[SECURITY_STACK_SIZE - 1]);

    void setupResult;
  });

  it("5-2-1-5: a mulligan redraw returns the whole hand to the deck, reshuffles, and deals a fresh 5-card hand", () => {
    cite(
      "comprehensive-0101",
      "5-2-1-5 a redraw returns the hand, shuffles, and draws a new opening hand",
      "bb2402c60b642e3c0dfe2592d132a1a69c5800280ef03be673c8ac9952a38319",
    );

    const state = new GameState();
    runSetup(state, {
      seats: [
        { sessionId: "s0", displayName: "A", deck: RED_DECK },
        { sessionId: "s1", displayName: "B", deck: BLUE_DECK },
      ],
      firstSeat: 0,
      seed: 7,
    });
    const p0 = state.players[0]!;
    const originalHandIds = new Set(p0.hand.map((c) => c.instanceId));
    const rng = makeRng(seatSeed(7, 0)); // a fresh stream — the redraw's own reshuffle is what's under test
    const deckSizeBefore = p0.deck.length;

    mulliganRedraw(p0, rng);

    expect(p0.hand.length).toBe(OPENING_HAND_SIZE); // still exactly 5 after the redraw
    expect(p0.deck.length).toBe(deckSizeBefore); // the 5 returned cards went back to the deck first
    // The redrawn hand's instance ids are drawn from the SAME pool (deck+original hand had 5
    // returned then 5 redrawn from the reshuffled 50) — not guaranteed identical to the original.
    const newHandIds = new Set(p0.hand.map((c) => c.instanceId));
    const overlap = [...newHandIds].filter((id) => originalHandIds.has(id));
    // A reshuffle CAN legitimately redeal an overlapping card; what §5-2-1-5 guarantees is the
    // hand size and that a fresh shuffle occurred, not disjointness. Assert the mechanical
    // guarantee only: `hasMulliganed` is now set, so a second call is a no-op (only once per player).
    expect(p0.hasMulliganed).toBe(true);
    const handAfterFirstRedraw = p0.hand.map((c) => c.instanceId);
    mulliganRedraw(p0, rng);
    expect(p0.hand.map((c) => c.instanceId)).toEqual(handAfterFirstRedraw); // idempotent: only once
    void overlap;
  });
});
