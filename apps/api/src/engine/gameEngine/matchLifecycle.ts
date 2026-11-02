import { applyScenarioEffects } from "../scenario/effects.js";
import type { Client } from "colyseus";
import {
  PlayerState,
  isDigimonWorldAvatarId,
  Phase,
  Permanent,
  type CardColor,
  type CardInstance,
  type Seat,
} from "@aegis/shared";
import {
  buildStateView,
  exposeCardInZone,
  forgetWithheldCards as forgetWithheldCardsIn,
  refreshStateView as refreshStateViewInto,
  syncPublicCounts,
} from "../state/visibility.js";
import { installVisibilityPort, type VisibilityZone, type VisibilityPort } from "../state/access.js";
import { colorsOf } from "../cards/cardData.js";
import { effectiveColors } from "../effects/continuous.js";
import { linkMax } from "../effects/mindLink.js";
import { logError } from "../../logger.js";
import { runSetup, finalizeSecurity, mulliganRedraw, makeRng, seatSeed, type Decklist } from "#api/engine/setup";
import { layScenarioFixture, type ScenarioFixture } from "../scenario/fixture.js";
import { validateDecklist } from "../deckValidation.js";
import type { SeatJoinOptions } from "./types.js";
import type { GameEngine } from "../GameEngine.js";

/**
 * Attach a connected client to a seat and stage their decklist. A placeholder
 * PlayerState (name + session, empty zones) is seated immediately so the room can
 * build engine seat's StateView on join; the real zones (deck/egg/hand/security) are
 * materialized from the staged decklist by {@link startMatch} when both seats are
 * present and setup runs.
 *
 * The client deck is attacker-controlled, so it is validated against the
 * deck-construction rules (50 main + ≤5 eggs, per-card copy limits, banlist
 * single-card restrictions) BEFORE anything is staged. An illegal deck throws,
 * which propagates out of {@link AegisRoom.onJoin} as a Colyseus seat rejection;
 * neither {@link PlayerState} nor the staged decklist is created for the seat.
 *
 * A fully-empty deck (`mainDeck` and `eggDeck` both empty) is the headless
 * board-setup sentinel used by engine unit tests that hand-build the board and
 * never run {@link startMatch}; it bypasses validation. A real client join always
 * sends a populated deck, and the 50-card size rule rejects an empty deck for
 * actual play, so engine sentinel cannot seat a playable illegal deck.
 */
export function seatPlayer(engine: GameEngine, seat: Seat, sessionId: string, options: SeatJoinOptions): void {
  const deckIsEmpty = options.deck.mainDeck.length === 0 && options.deck.eggDeck.length === 0;
  if (!deckIsEmpty) {
    const verdict = validateDecklist(options.deck, {
      betaBattleMode: options.betaBattleMode === true,
      unlimited: options.unlimited === true,
      format: options.format,
      banlistCards: options.banlistCards,
    });
    if (!verdict.ok) throw new Error(`illegal deck: ${verdict.reason}`);
  }
  const player = new PlayerState();
  player.seat = seat;
  player.sessionId = sessionId;
  player.displayName = options.displayName;
  player.avatarId = isDigimonWorldAvatarId(options.avatarId) ? options.avatarId : "";
  engine.state.players[seat] = player;
  engine.stagedDecks[seat] = options.deck;
  // Seating replaces the PlayerState object, so the port has to be re-installed on the new
  // one; installing it here (rather than at match start) also covers the cards `runSetup`
  // deals, which arrive before any turn is played.
  if (engine.visibilityNotify !== undefined) installVisibilityPort(player, engine.visibilityNotify);
}

/** Readiness belongs to the current occupant, not permanently to a seat. */
export function clearReady(engine: GameEngine, seat: Seat): void {
  if (!engine.bothReadyFired) engine.readySeats.delete(seat);
}

/**
 * Begin the match once both seats are filled (subsystem: deck-and-setup). Runs the
 * official pre-game procedure (Comprehensive Rules §5-2) and then starts the turn
 * loop:
 *
 *   1. choose the first player deterministically from the match seed (stands in for
 *      §5-2-1-3 rock-paper-scissors until a coin-toss intent flow is added),
 *   2. {@link runSetup}: build both players' zones from their decklists, shuffle
 *      deck + egg deck (seeded), deal 5-card opening hands, memory := 0, record the
 *      first player (§5-2-1-1/2/4/7),
 *   3. emit `matchStarted`,
 *   4. open the mulligan window for each seat, first player first (§5-2-1-4/5):
 *      a redraw reshuffles the hand back and draws 5 again, on the SAME seeded
 *      stream,
 *   5. {@link finalizeSecurity}: set each seat's 5-card face-down security stack
 *      from the post-mulligan deck top (§5-2-1-6),
 *   6. start the turn loop at turn 1 with the first player (§5-2-1-8); the
 *      first player's first Draw is skipped by the turn machine.
 *
 * Async (the mulligan window awaits client input); fire-and-forget from the room.
 */
export function startMatch(engine: GameEngine): void {
  engine.matchSetupStarted = true;
  void runMatch(engine);
}

export async function runMatch(engine: GameEngine): Promise<void> {
  const decks = collectStagedDecks(engine);
  if (decks === undefined) return; // a seat joined without a deck; cannot start

  let firstSeat = chooseFirstPlayer(engine);
  const setup = runSetup(engine.state, {
    seats: [
      {
        sessionId: engine.state.players[0]!.sessionId,
        displayName: engine.state.players[0]!.displayName,
        deck: decks[0],
      },
      {
        sessionId: engine.state.players[1]!.sessionId,
        displayName: engine.state.players[1]!.displayName,
        deck: decks[1],
      },
    ],
    firstSeat,
    seed: engine.hooks.seed,
    randomKey: engine.hooks.randomKey,
    onShuffled: (seat, deck) => engine.hooks.emit({ kind: "deckShuffled", seat, deck }),
  });
  engine.rngForSeat = setup.rngForSeat;
  engine.randomStreams = [setup.rngForSeat(0).generator, setup.rngForSeat(1).generator];

  if (engine.manual) {
    const chooser = firstSeat;
    const response = await engine.decisions.request({
      seat: chooser,
      kind: "chooseOption",
      promptText: "Choose who goes first",
      options: {
        choices: [engine.state.players[chooser]!.displayName, engine.state.players[1 - chooser]!.displayName],
      },
    });
    if (engine.state.gameOver) {
      return;
    }
    firstSeat = response.kind === "chooseOption" && response.optionIndex === 1 ? ((1 - chooser) as Seat) : chooser;
    engine.state.turnSeat = firstSeat;
  }
  engine.hooks.emit({ kind: "matchStarted", firstSeat });
  await runMulliganWindow(engine, firstSeat);
  if (engine.state.gameOver) return; // a seat left during setup

  finalizeSecurity(engine.state);

  if (engine.manual) {
    engine.manual.begin();
    return;
  }
  void startTurnLoop(engine);
}

/**
 * Development-only alternative to {@link startMatch}: skip the pre-game procedure, lay a
 * fixture board, and start the real turn loop on it. The room only
 * exposes engine outside production.
 */
export function startScenarioFixture(engine: GameEngine, fixture: ScenarioFixture): void {
  const decks = collectStagedDecks(engine);
  if (decks === undefined) return;
  const random = [
    makeRng(seatSeed(engine.hooks.seed, 0), engine.hooks.randomKey),
    makeRng(seatSeed(engine.hooks.seed, 1), engine.hooks.randomKey),
  ];
  engine.rngForSeat = (seat) => random[seat]!;
  engine.randomStreams = [random[0]!.generator, random[1]!.generator];
  const references = layScenarioFixture(engine.state, fixture, decks);
  engine.matchSetupStarted = true;
  applyScenarioEffects(engine, fixture, references);
  engine.hooks.emit({ kind: "matchStarted", firstSeat: engine.state.turnSeat });
  void startTurnLoop(engine);
}

/** Gather both staged decklists; undefined if either seat has not staged one. */
export function collectStagedDecks(engine: GameEngine): [Decklist, Decklist] | undefined {
  const a = engine.stagedDecks[0];
  const b = engine.stagedDecks[1];
  if (a === undefined || b === undefined) return undefined;
  return [a, b];
}

/**
 * Decide the first player. The rulebook uses rock-paper-scissors (§5-2-1-3); since
 * Aegis has no such intent yet, the choice is derived deterministically from the
 * server-only match seed so a given seed always yields the same first player (and
 * tests are reproducible). Replace with the coin-toss intent flow when added.
 */
export function chooseFirstPlayer(engine: GameEngine): Seat {
  if (engine.hooks.firstSeat !== undefined) return engine.hooks.firstSeat;
  return ((engine.hooks.seed & 1) === 0 ? 0 : 1) as Seat;
}

/**
 * Run the mulligan window for both seats in turn order (first player first,
 * §5-2-1-4). Each seat is prompted via the MulliganCoordinator and answers with a
 * `mulligan` intent; a redraw is applied on the seat's own seeded PRNG stream.
 */
export async function runMulliganWindow(engine: GameEngine, firstSeat: Seat): Promise<void> {
  const order: Seat[] = [firstSeat, (1 - firstSeat) as Seat];
  for (const seat of order) {
    if (engine.state.gameOver) return;
    const keep = await engine.mulligan.request(seat);
    if (!keep && engine.rngForSeat !== undefined) {
      const player = engine.state.players[seat];
      if (player !== undefined) {
        mulliganRedraw(player, engine.rngForSeat(seat), (deck) =>
          engine.hooks.emit({ kind: "deckShuffled", seat, deck }),
        );
      }
    }
  }
}

/**
 * Drive the full turn loop to completion (subsystem: turn-phase-state-machine).
 * Async and fire-and-forget from the caller's perspective; surfaces a fatal engine
 * error to the room rather than letting the promise reject silently.
 */
export async function startTurnLoop(engine: GameEngine): Promise<void> {
  try {
    await engine.turnMachine.run();
  } catch (err) {
    logError("[engine] turn loop fatal error:", err);
    engine.hooks.emit({
      kind: "actionRejected",
      intent: "turnLoop",
      reason: err instanceof Error ? err.message : "turn-loop-error",
    });
  }
}

/**
 * Drive exactly ONE turn (Active -> Draw -> Breeding -> Main -> End) through the real
 * turn machine and its real timing wiring. Test-only seam: it is a thin pass-through
 * to `turnMachine.runTurn()` (no new game logic) so a harness can open the OnStartTurn
 * / OnEndTurn windows — which fire effects through the real `fireTiming` — without
 * spinning up the full `run()` loop (whose interactive Main phase blocks on client
 * verbs). The Main phase still blocks until the turn player sends an `endPhase` intent
 * (MainPhaseController), so the caller awaits engine promise while feeding that intent.
 *
 * This exists because two turn-window effects (Start-of-Your-Turn SetMemory, the
 * end-of-turn timings) are only reachable through the loop; the hand-laid intent
 * harness has no beginTurn intent. Mirrors the `startTurnLoop` pattern (it likewise
 * delegates straight to the turn machine). NOT part of the production intent surface.
 */
export async function runOneTurn(engine: GameEngine): Promise<void> {
  await engine.turnMachine.runTurn();
}

/**
 * Build the per-seat filtered view of state (hidden zones redacted).
 *
 * The secret PlayerState zones carry @view(PRIVATE_VIEW_TAG); buildStateView
 * unlocks only THIS seat's own private zones, so the opponent never receives the
 * card identities in your deck, egg deck, hand, or face-down security. The public
 * board (battle areas, breeding, trash, memory, phase) and the per-zone count
 * mirrors stay visible to both. See engine/state/visibility.ts.
 *
 * syncPublicCounts is called first so the public counts reflect the current zone
 * sizes at the moment a client joins / its view is (re)built. The per-state-patch
 * refresh of those counts is the room/turn-loop's responsibility (it must call
 * syncPublicCounts before each broadcast); that hook is owned by the
 * intent-protocol-and-room subsystem.
 */
export function makeStateView(engine: GameEngine, seat: Seat | undefined): Client["view"] {
  syncPublicCounts(engine.state);
  return buildStateView(engine.state, seat);
}

/**
 * Bring an EXISTING per-seat StateView up to date in place, instead of replacing
 * it. The room MUST use engine (not `makeStateView`) for every mid-match refresh —
 * see `engine/state/visibility.ts`'s `refreshStateView` for why replacing a
 * connected client's view wholesale silently strands the removal of any card
 * that just left a `@view`-tagged zone (e.g. a card played from hand), and
 * `AegisRoom.rebuildClientViews` for the call site engine backs.
 */
export function refreshStateView(engine: GameEngine, view: Client["view"], seat: Seat | undefined): void {
  if (view === undefined) return;
  syncPublicCounts(engine.state);
  refreshStateViewInto(view, engine.state, seat);
}

/** Release a client's view of the cards that left its sight; the room calls it after each patch. */
export function forgetWithheldCards(engine: GameEngine, view: Client["view"], seat: Seat | undefined): void {
  if (view === undefined) return;
  forgetWithheldCardsIn(view, engine.state, seat);
}

/**
 * Install the mutation seam's visibility port for both seats. `notify` is called once per
 * card arrival in a loose zone; the room turns that into an `exposeCardInZone` per connected
 * client. Idempotent — installing again simply replaces the callback.
 *
 * Without engine the private zones are never exposed mid-match (the per-patch full walk that
 * used to do it was removed: it re-queued a forced ADD for every field of every card on
 * every patch, so each patch carried the whole state).
 */
export function installVisibility(engine: GameEngine, notify: VisibilityPort): void {
  engine.visibilityNotify = notify;
  for (const player of engine.state.players) installVisibilityPort(player, notify);
}

/**
 * Apply one card arrival to one client's view. Thin pass-through to the visibility policy
 * so the room stays free of StateView details, mirroring `refreshStateView` above.
 */
export function exposeCardToView(
  engine: GameEngine,
  view: Client["view"],
  viewerSeat: Seat | undefined,
  ownerSeat: Seat,
  zone: VisibilityZone,
  card: CardInstance,
): void {
  if (view === undefined) return;
  exposeCardInZone(view, viewerSeat, ownerSeat, zone, card);
}

/**
 * Refresh the public per-zone count mirrors from the (hidden) zone arrays so the
 * opponent's view shows correct deck/hand/security sizes (subsystem:
 * intent-protocol-and-room). The room calls engine from `onBeforePatch`, i.e. before
 * every state broadcast, which is the documented owner of engine refresh (the private
 * arrays are redacted per-seat, so only these counts convey their sizes).
 */
export function syncCounts(engine: GameEngine): void {
  syncPublicCounts(engine.state);
}

export function handleReconnect(engine: GameEngine, seat: Seat): void {
  const player = engine.state.players[seat];
  if (player !== undefined) player.connected = true;
}

export function handleDisconnect(engine: GameEngine, seat: Seat, consented: boolean): void {
  const player = engine.state.players[seat];
  if (player !== undefined) player.connected = false;

  // A consented leave during an active match is a concession: the opponent wins
  // immediately. Phase.None means the match hasn't started yet (still in
  // setup/mulligan), so a pre-game disconnect is not a surrender — just clean up.
  if (consented && !engine.state.gameOver && (engine.state.phase !== Phase.None || engine.matchSetupStarted)) {
    engine.win.surrender(seat);
    engine.decisions.cancel();
    engine.mulligan.cancel();
    engine.mainPhase.abort();
    engine.breeding.abort();
    return;
  }
  if (consented && !engine.state.gameOver && engine.state.phase === Phase.None) {
    engine.mulligan.cancel();
    return;
  }
  // A non-consented drop just marks the seat disconnected here; the reconnection
  // grace period and its clock are owned by AegisRoom.onLeave (Colyseus
  // allowReconnection), which calls handleDisconnect(seat, true) if the grace
  // period elapses without a reconnect.
}

/**
 * Handle a seat disconnecting. `handleDisconnect` marks PlayerState.connected =
 * false; on a consented drop (or once the grace period elapses) the caller
 * resolves the match as a surrender. The grace-period clock lives in
 * `AegisRoom.onLeave` via Colyseus's `allowReconnection`.
 */
/**
 * Close an unanswered combat prompt at its safe default (the room's answer-timeout
 * backstop). Returns whether a window was open to close.
 */
export function expireCombatWindow(engine: GameEngine): boolean {
  // An accepted Counter owns this window until its asynchronous effects finish. Closing it
  // here resumes the attack alongside the Blast and mixes their effect controller contexts.
  if (engine.counterResolutionInFlight) return false;
  return engine.combat.expireOpenWindow();
}

/**
 * A permanent's EFFECTIVE color set (static-continuous-effects subsystem, LOCKED Q4): its
 * top card's printed colors UNIONED with every continuously-derived color grant
 * layering (BaseCardColors then each active color-grant appends, then Distinct;
 * documented behavior). Server-authoritative: the set is recomputed by the engine layering
 * pass, never supplied by a client. The color-legality consumers (engine play-time gate and
 * the digivolve EvoCost color check) read engine instead of the printed colors. An empty
 * top card yields no colors.
 */
export function effectiveColorsOf(engine: GameEngine, permanent: Permanent): CardColor[] {
  const top = permanent.topCard;
  if (top === undefined) return [];
  return effectiveColors(engine.continuous, permanent.permanentId, colorsOf(top.cardId)) as CardColor[];
}

/**
 * A permanent's EFFECTIVE link limit:
 * the base 1 plus the sum of every active `<Link +N>` grant keyed to engine permanent in
 * the continuous-effect ledger. Server-authoritative — `runLink` and the rule sweep read
 * engine to cap how many link cards a Digimon may hold; a client never supplies the cap.
 */
export function linkMaxOf(engine: GameEngine, permanent: Permanent): number {
  return linkMax(permanent, { linkMaxDelta: (id) => engine.continuous.linkMaxDelta(id) });
}
