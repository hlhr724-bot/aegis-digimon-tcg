import { describe, it, expect, beforeEach } from "vitest";
import { GameState, Phase, type Seat, type ServerEvent, type DecisionRequest } from "@aegis/shared";
import { GameEngine, type GameEngineHooks } from "./GameEngine.js";
import { RED_DECK, BLUE_DECK, MAIN_DECK_SIZE } from "./testDecks.js";
import { OPENING_HAND_SIZE } from "@aegis/shared/rules/OPENING_HAND_SIZE";
import { SECURITY_STACK_SIZE } from "@aegis/shared/rules/SECURITY_STACK_SIZE";

/**
 * Headless match-start + turn-loop integration test (subsystems: deck-and-setup,
 * turn-phase-state-machine). Drives a real GameEngine — no Colyseus transport — with
 * the two built-in test decks through startMatch and the opening turn, asserting:
 *   - the dealt state per the rulebook (§5-2): hand = 5, security = 5, egg deck = 5,
 *     deck = 50 - 5 - 5, memory = 0, a first player chosen,
 *   - the turn loop advances through the phases and passes the turn.
 *
 * The engine drives setup/turns asynchronously (the mulligan window and the
 * breeding/main windows await client input), so the test feeds intents and flushes
 * the microtask queue between steps, exactly as the room would relay them.
 */

interface Harness {
  engine: GameEngine;
  state: GameState;
  events: ServerEvent[];
  decisions: Array<{ seat: Seat; req: DecisionRequest }>;
}

/**
 * Let queued promise continuations settle. The turn loop chains several awaits per
 * phase (timing windows, unsuspend, the phase setters), so draining it from one open
 * input window to the next takes many hops — and passing the turn crosses more of them
 * than a single burst of microtasks covers. Interleave macrotask turns so the drain ends
 * when the engine is genuinely idle rather than after a fixed hop count.
 */
async function flush(): Promise<void> {
  for (let round = 0; round < 8; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let hop = 0; hop < 64; hop += 1) {
      await Promise.resolve();
    }
  }
}

function makeHarness(seed: number): Harness {
  const state = new GameState();
  const events: ServerEvent[] = [];
  const decisions: Array<{ seat: Seat; req: DecisionRequest }> = [];
  const hooks: GameEngineHooks = {
    seed,
    emit: (event) => events.push(event),
    requestDecision: (seat, req) => decisions.push({ seat, req }),
  };
  const engine = new GameEngine(state, hooks);
  // Seat both players with the test decks (the room does this on join).
  engine.seatPlayer(0, "session-0", { displayName: "Red", deck: { ...RED_DECK } });
  engine.seatPlayer(1, "session-1", { displayName: "Blue", deck: { ...BLUE_DECK } });
  return { engine, state, events, decisions };
}

/** The seat the engine prompts first is the chosen first player (§5-2-1-4). */
function firstSeatFromMulligan(decisions: Harness["decisions"]): Seat {
  const first = decisions.find((d) => d.req.kind === "mulligan");
  if (first === undefined) throw new Error("no mulligan decision was raised");
  return first.seat;
}

/** Answer both seats' mulligan windows keeping the dealt hand (first player first). */
async function resolveMulligans(h: Harness): Promise<Seat> {
  await flush();
  const firstSeat = firstSeatFromMulligan(h.decisions);
  expect(h.engine.applyIntent(firstSeat, { type: "mulligan", keep: true })).toEqual({ ok: true });
  await flush();
  const secondSeat = (1 - firstSeat) as Seat;
  expect(h.engine.applyIntent(secondSeat, { type: "mulligan", keep: true })).toEqual({ ok: true });
  await flush();
  return firstSeat;
}

describe("GameEngine.startMatch - deck-and-setup", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness(2); // even seed => first player is seat 0 (chooseFirstPlayer)
  });

  it("emits matchStarted and opens the first player's mulligan window", async () => {
    h.engine.startMatch();
    await flush();

    expect(h.events.some((e) => e.kind === "matchStarted")).toBe(true);
    const mull = h.decisions.find((d) => d.req.kind === "mulligan");
    expect(mull).toBeDefined();
    expect(mull!.seat).toBe(0); // even seed => seat 0 goes first
  });

  it("emits deckShuffled for both piles of both seats during setup", async () => {
    h.engine.startMatch();
    await flush();

    const shuffles = h.events
      .filter((e) => e.kind === "deckShuffled")
      .map((e) => `${(e as { seat: number }).seat}:${(e as { deck: string }).deck}`);
    expect(shuffles).toEqual(["0:deck", "0:eggDeck", "1:deck", "1:eggDeck"]);
  });

  it("emits deckShuffled again for a seat that takes its mulligan", async () => {
    h.engine.startMatch();
    await flush();
    const before = h.events.filter((e) => e.kind === "deckShuffled").length;

    expect(h.engine.applyIntent(0, { type: "mulligan", keep: false })).toEqual({ ok: true });
    await flush();

    const added = h.events.filter((e) => e.kind === "deckShuffled").slice(before);
    expect(added.map((e) => `${(e as { seat: number }).seat}:${(e as { deck: string }).deck}`)).toEqual([
      "0:deck",
      "0:eggDeck",
    ]);
  });

  it("deals the rulebook opening state once mulligans resolve (hand 5, security 5, memory 0)", async () => {
    h.engine.startMatch();
    const firstSeat = await resolveMulligans(h);

    // Drive past the first player's breeding window (egg deck is non-empty, so the
    // window opens) by skipping it; then the Main phase is open and state is settled.
    await skipBreedingIfOpen(h, firstSeat);

    for (const seat of [0, 1] as const) {
      const player = h.state.players[seat]!;
      expect(player.hand.length, `seat ${seat} hand`).toBe(OPENING_HAND_SIZE);
      expect(player.security.length, `seat ${seat} security`).toBe(SECURITY_STACK_SIZE);
      expect(player.eggDeck.length, `seat ${seat} egg deck`).toBe(5);
    }
    // First player skipped their first Draw, so their deck is the full main minus the
    // opening hand and security; the non-turn player likewise untouched.
    const expectedDeck = MAIN_DECK_SIZE - OPENING_HAND_SIZE - SECURITY_STACK_SIZE; // 40
    expect(h.state.players[0]!.deck.length).toBe(expectedDeck);
    expect(h.state.players[1]!.deck.length).toBe(expectedDeck);

    expect(h.state.memory).toBe(0);
    expect(h.state.turnSeat).toBe(firstSeat);
    expect(h.state.turnCount).toBe(1);
  });

  it("preserves the seated PlayerState object identity through setup (StateView stays valid)", async () => {
    // The room builds a per-seat StateView bound to the PlayerState object at join,
    // before startMatch. Setup must populate that SAME object, not swap it, or the
    // owner's view would no longer unlock their (new) private zones.
    const seatedBefore = [h.state.players[0], h.state.players[1]];
    h.engine.startMatch();
    await resolveMulligans(h);

    expect(h.state.players[0]).toBe(seatedBefore[0]);
    expect(h.state.players[1]).toBe(seatedBefore[1]);
    // And those same objects now hold the dealt zones.
    expect(h.state.players[0]!.hand.length).toBe(OPENING_HAND_SIZE);
  });

  it("security stacks are face-down (redacted) after the deal", async () => {
    h.engine.startMatch();
    const firstSeat = await resolveMulligans(h);
    await skipBreedingIfOpen(h, firstSeat);

    for (const seat of [0, 1] as const) {
      for (const card of h.state.players[seat]!.security) {
        expect(card.faceUp).toBe(false);
      }
    }
  });

  it("is reproducible from a seed (same seed => same dealt hands)", async () => {
    const a = makeHarness(12345);
    const b = makeHarness(12345);
    a.engine.startMatch();
    b.engine.startMatch();
    await resolveMulligans(a);
    await resolveMulligans(b);

    const handA = a.state.players[0]!.hand.map((c) => c.cardId);
    const handB = b.state.players[0]!.hand.map((c) => c.cardId);
    expect(handA).toEqual(handB);
    expect(handA.length).toBe(OPENING_HAND_SIZE);
  });

  it("a different seed can pick a different first player", async () => {
    const even = makeHarness(2);
    const odd = makeHarness(3);
    even.engine.startMatch();
    odd.engine.startMatch();
    await flush();
    expect(firstSeatFromMulligan(even.decisions)).toBe(0);
    expect(firstSeatFromMulligan(odd.decisions)).toBe(1);
  });
});

describe("GameEngine turn loop - phases advance and the turn passes", () => {
  it("advances Active -> Draw -> Breeding -> Main and then passes the turn on endPhase", async () => {
    const h = makeHarness(2); // first player seat 0
    h.engine.startMatch();
    const firstSeat = await resolveMulligans(h);
    expect(firstSeat).toBe(0);

    // The turn loop is now in seat 0's turn. The breeding window is open (the egg
    // deck is non-empty, so hatching is possible) — skip it.
    const skipped = h.engine.applyIntent(firstSeat, { type: "endPhase" });
    expect(skipped).toEqual({ ok: true });
    await flush();

    // Now the Main phase is open for seat 0, turn 1.
    expect(h.state.phase).toBe(Phase.Main);
    expect(h.state.turnSeat).toBe(0);
    expect(h.state.turnCount).toBe(1);

    // The first four phase-change events drive the opening turn in order. (The
    // Active event is emitted before turnCount is incremented, so it carries
    // turnCount 0 — the leading-sequence assertion is robust to that.)
    const phaseChanges = h.events
      .filter((e): e is Extract<ServerEvent, { kind: "phaseChanged" }> => e.kind === "phaseChanged")
      .map((e) => e.phase);
    expect(phaseChanges.slice(0, 4)).toEqual([Phase.Active, Phase.Draw, Phase.Breeding, Phase.Main]);

    // End the Main phase: the turn passes to seat 1 and turn 2 begins.
    const ended = h.engine.applyIntent(0, { type: "endPhase" });
    expect(ended).toEqual({ ok: true });
    await flush();

    expect(h.state.turnSeat).toBe(1);
    expect(h.state.turnCount).toBe(2);
    // Seat 1 (not the first player) draws on their turn: deck drops by 1 from 40.
    expect(h.state.players[1]!.deck.length).toBe(MAIN_DECK_SIZE - OPENING_HAND_SIZE - SECURITY_STACK_SIZE - 1);
  });

  it("the first player skips their first Draw but the second player draws", async () => {
    const h = makeHarness(2);
    h.engine.startMatch();
    await resolveMulligans(h);

    // Seat 0 (first player) skipped the Draw: hand still 5.
    expect(h.state.players[0]!.hand.length).toBe(OPENING_HAND_SIZE);

    // Skip breeding + main to pass to seat 1.
    h.engine.applyIntent(0, { type: "endPhase" }); // skip breeding
    await flush();
    h.engine.applyIntent(0, { type: "endPhase" }); // end main -> pass turn
    await flush();

    // Seat 1's Draw phase drew a card: hand is 6.
    expect(h.state.players[1]!.hand.length).toBe(OPENING_HAND_SIZE + 1);
  });
});

/**
 * If the turn player's breeding window is open (a hatch/move is possible), close it
 * with an endPhase skip so the Main phase opens. No-op if breeding already auto-skipped.
 */
async function skipBreedingIfOpen(h: Harness, seat: Seat): Promise<void> {
  if (h.state.phase === Phase.Breeding) {
    h.engine.applyIntent(seat, { type: "endPhase" });
    await flush();
  }
}
