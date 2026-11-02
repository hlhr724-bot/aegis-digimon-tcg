import { SeededRandom } from "#api/engine/random/SeededRandom";
import type { StatefulRng } from "#api/engine/random/StatefulRng";
import { createHash, createHmac } from "node:crypto";
import { CardInstance, PlayerState, Zone, type GameState, type Seat } from "@aegis/shared";
import { resolveCardArt } from "@aegis/shared";
import { clearBattleArea, clearZone, fillZone, insertCard, setBreeding, takeTop } from "./state/access.js";

/**
 * Match setup: build each seat's zones from its decklist and run the official
 * pre-game procedure (subsystem: deck-and-setup; source: Comprehensive Rules §5-2
 * "Pre-Game Preparations", reproduced in tools/kb rules).
 *
 * The KB §5-2-1 sequence this implements, in order:
 *   1. §5-2-1-1  shuffle the deck (face down),
 *   2. §5-2-1-2  shuffle the Digi-Egg deck,
 *   3. §5-2-1-3  decide the first/second player,
 *   4. §5-2-1-4  each draws 5 for their opening hand,
 *   5. §5-2-1-4/5 each may redraw (mulligan) once — return hand, shuffle, draw 5,
 *   6. §5-2-1-6  set the top 5 cards of the deck as the face-down security stack
 *                (the top card of the deck becomes the BOTTOM of the security stack),
 *   7. §5-2-1-7  place the memory gauge at 0,
 *   8. §5-2-1-8  the game begins with the first player's turn.
 *
 * Everything here mutates only the passed schema instances and is driven by an
 * injected, seeded PRNG so a match is fully reproducible from one seed (API-CONTRACT
 * §7 "Determinism": the seed is server-only; clients see counts, never order). The
 * engine owns *when* mulligan/first-player are decided (they need a client round
 * trip); this module owns the deterministic mechanics each decision triggers.
 */

/** Cards drawn for the opening hand (Comprehensive Rules §5-2-1-4). */
export const OPENING_HAND_SIZE = 5;
/** Cards set face-down as the initial security stack (Comprehensive Rules §5-2-1-6). */
export const SECURITY_STACK_SIZE = 5;

/** A deterministic PRNG returning floats in [0, 1). */
export type Rng = () => number;

export function makeRng(seed: number, randomKey?: string): StatefulRng {
  const generator = new SeededRandom({ seed, randomKey });
  return Object.assign(() => generator.next(), { generator });
}

/**
 * Derive an independent sub-seed for a seat so the two decks shuffle from different
 * streams of the one match seed (otherwise identical decklists would shuffle
 * identically). Deterministic in the match seed, so the match stays reproducible.
 */
export function seatSeed(matchSeed: number, seat: Seat): number {
  return (matchSeed ^ Math.imul(seat + 1, 0x9e3779b1)) >>> 0;
}

/**
 * In-place Fisher-Yates shuffle driven by the injected PRNG (uniform). Returns the
 * same array for convenience. Iterating high->low and swapping with a uniformly
 * chosen earlier-or-equal index is the standard unbiased shuffle.
 */
export function shuffleInPlace<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}

function makeInstances(
  seat: Seat,
  cardIds: readonly string[],
  startOrdinal: number,
  artIds?: readonly string[],
  randomKey?: string,
): CardInstance[] {
  return cardIds.map((cardId, offset) => {
    const card = new CardInstance();
    const ordinal = startOrdinal + offset;
    card.instanceId =
      randomKey === undefined
        ? `s${seat}-${ordinal}`
        : `s${seat}-${createHmac("sha256", randomKey).update(`identity:${seat}:${ordinal}`).digest("hex")}`;
    card.cardId = cardId;
    card.artId = resolveCardArt(cardId, artIds?.[offset]).artId;
    card.ownerSeat = seat;
    card.faceUp = false;
    return card;
  });
}

/** A decklist as flat card-id lists (the room join-options shape). */
export interface Decklist {
  mainDeck: string[];
  eggDeck: string[];
  mainDeckArts?: string[];
  eggDeckArts?: string[];
}

/**
 * Load a seat's deck and egg deck from a decklist into a PlayerState, resetting all
 * board zones to empty (steps before the shuffle). The deck/egg-deck CardInstances
 * are created here; the board zones (hand, security, battle area, breeding, trash)
 * start empty and are populated by {@link runSetup}. Instance ids are unique within
 * the seat (and, via the seat prefix, within the match).
 *
 * Mutates the passed PlayerState IN PLACE so an already-seated placeholder (whose
 * object identity a per-seat StateView may already reference) keeps that identity —
 * critical for visibility: the owner's view is bound to this exact PlayerState
 * object, so it must not be swapped for a new one.
 *
 * Likewise, the ArraySchema field INSTANCES must not be replaced: Colyseus StateView
 * tracks each ArraySchema by the specific ChangeTree registered at view.add() time, so
 * swapping them for new objects silently breaks visibility (the client never sees cards
 * dealt into the new arrays). All zone resets therefore clear-and-repopulate in place.
 */
export function loadDeckInto(player: PlayerState, seat: Seat, deck: Decklist, randomKey?: string): PlayerState {
  player.seat = seat;

  const mainInstances = makeInstances(seat, deck.mainDeck, 0, deck.mainDeckArts, randomKey);
  const eggInstances = makeInstances(seat, deck.eggDeck, deck.mainDeck.length, deck.eggDeckArts, randomKey);

  fillZone(player, Zone.Deck, mainInstances);
  fillZone(player, Zone.EggDeck, eggInstances);
  clearZone(player, Zone.Hand);
  clearZone(player, Zone.Security);
  clearZone(player, Zone.Trash);
  clearBattleArea(player);
  setBreeding(player, undefined);
  player.connected = true;
  player.hasMulliganed = false;
  player.lost = false;
  return player;
}

/**
 * Create a fresh PlayerState for a seat and load a decklist into it. Convenience for
 * tests and standalone setup; the engine reuses the already-seated placeholder via
 * {@link loadDeckInto} to preserve its StateView identity.
 */
export function buildPlayerState(seat: Seat, sessionId: string, displayName: string, deck: Decklist): PlayerState {
  const player = new PlayerState();
  player.sessionId = sessionId;
  player.displayName = displayName;
  return loadDeckInto(player, seat, deck);
}

/** Which pile a {@link shuffleDecks} pass just randomized, for the `deckShuffled` event. */
export type ShuffledDeck = "deck" | "eggDeck";

/**
 * Shuffle a seat's deck and egg deck in place (Comprehensive Rules §5-2-1-1/2).
 *
 * `onShuffled` is invoked once per pile, immediately after that pile is randomized, so a
 * caller can narrate the shuffle without re-deriving when one happened. It lives here
 * rather than at the call sites because this is the only deck shuffle in the game: every
 * printed "shuffle" in the card pool shuffles a SECURITY stack, not a deck (see the §3-2-3
 * invariant asserted in interactionAudit.test.ts).
 */
export function shuffleDecks(player: PlayerState, rng: Rng, onShuffled?: (deck: ShuffledDeck) => void): void {
  const shuffleZone = (zone: typeof player.deck): void => {
    zone.move((cards) => {
      for (let i = cards.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        if (i === j) continue;
        [cards[i], cards[j]] = [cards[j]!, cards[i]!];
      }
    });
  };

  shuffleZone(player.deck);
  onShuffled?.("deck");
  shuffleZone(player.eggDeck);
  onShuffled?.("eggDeck");
}

/**
 * Draw the opening hand: move the top {@link OPENING_HAND_SIZE} cards from the deck to
 * the hand (Comprehensive Rules §5-2-1-4). The hand is private; cards stay face-down
 * in the schema (the owner's view still shows them — visibility layer).
 */
export function dealOpeningHand(player: PlayerState): void {
  for (let i = 0; i < OPENING_HAND_SIZE; i += 1) {
    const top = takeTop(player, Zone.Deck);
    if (top === undefined) break;
    insertCard(player, Zone.Hand, top);
  }
}

/**
 * Perform a mulligan redraw for a seat (Comprehensive Rules §5-2-1-5): return the
 * entire hand to the deck, reshuffle the deck, and draw a fresh opening hand. Must be
 * called before the security stack is set (the redraw shuffles the cards that will
 * become security back in). Idempotent guard: marks `hasMulliganed`; calling twice is
 * a no-op after the first (each player may redraw only once).
 */
export function mulliganRedraw(player: PlayerState, rng: Rng, onShuffled?: (deck: ShuffledDeck) => void): void {
  if (player.hasMulliganed) return;
  player.hasMulliganed = true;

  const returned = clearZone(player, Zone.Hand);
  // The opening hand was visible to its owner. Reusing one of those instances
  // after the reshuffle would let the client identify it in face-down security
  // by its instanceId, even if cardId is correctly redacted. Give each returned
  // card an opaque, seed-replayable identity before it re-enters the hidden deck.
  const usedIds = new Set([
    ...player.deck.map((card) => card.instanceId),
    ...player.eggDeck.map((card) => card.instanceId),
    ...returned.map((card) => card.instanceId),
  ]);
  for (const card of returned) {
    const hidden = new CardInstance();
    // Hash the PRNG draws before an ID is ever projected to a client; publishing
    // raw draws would disclose the shuffle stream directly.
    const material = Array.from({ length: 3 }, () =>
      Math.floor(rng() * 0x100000000)
        .toString(16)
        .padStart(8, "0"),
    ).join("");
    const token = createHash("sha256").update(material).digest("hex").slice(0, 24);
    const baseId = `hidden-s${player.seat}-${token}`;
    let id = baseId;
    let suffix = 0;
    while (usedIds.has(id)) id = `${baseId}-${++suffix}`;
    usedIds.add(id);
    hidden.instanceId = id;
    hidden.cardId = card.cardId;
    hidden.artId = card.artId;
    hidden.ownerSeat = card.ownerSeat;
    hidden.faceUp = false;
    insertCard(player, Zone.Deck, hidden);
  }
  shuffleDecks(player, rng, onShuffled);
  dealOpeningHand(player);
}

/**
 * Set the initial security stack (Comprehensive Rules §5-2-1-6): take the top
 * {@link SECURITY_STACK_SIZE} cards of the deck and place them face-down so that the
 * top card of the deck becomes the BOTTOM of the security stack. The schema stores
 * `security[0]` as the TOP of the stack, so the cards drawn off the deck top are
 * pushed in reverse: the first card off the deck ends up last (bottom), the fifth
 * card off the deck ends up at index 0 (top).
 */
export function setSecurityStack(player: PlayerState): void {
  const taken: CardInstance[] = [];
  for (let i = 0; i < SECURITY_STACK_SIZE; i += 1) {
    const top = takeTop(player, Zone.Deck);
    if (top === undefined) break;
    taken.push(top);
  }
  // taken[0] is the deck's top card -> it must become the stack bottom; reversing
  // makes the LAST card taken the security top (index 0), matching §5-2-1-6.
  taken.reverse();
  for (const card of taken) insertCard(player, Zone.Security, card);
}

/** Inputs the full setup needs once both seats are seated. */
export interface SetupInput {
  /** Per-seat session id, display name, and decklist (index === seat). */
  seats: readonly { sessionId: string; displayName: string; deck: Decklist }[];
  /** The first player (Comprehensive Rules §5-2-1-3; here chosen by the engine). */
  firstSeat: Seat;
  /** Master match seed (server-only); per-seat sub-seeds are derived from it. */
  seed: number;
  randomKey?: string;
  /** Narration hook for each pile randomized during setup (see {@link shuffleDecks}). */
  onShuffled?: (seat: Seat, deck: ShuffledDeck) => void;
}

/** Per-seat PRNG used for that seat's shuffles (so a later mulligan reshuffles deterministically). */
export interface SetupResult {
  rngForSeat: (seat: Seat) => StatefulRng;
}

/**
 * Run pre-game setup up to (but not including) the mulligan decisions and the first
 * turn. Builds both PlayerStates into `state.players`, shuffles, deals opening hands,
 * sets the memory gauge to 0, and records the first player — i.e. KB §5-2-1-1
 * through §5-2-1-4 and §5-2-1-7. The security stack (§5-2-1-6) is set AFTER the
 * mulligan window (a redraw reshuffles the would-be security cards back into the
 * deck), so the engine calls {@link setSecurityStack} for each seat once mulligans
 * resolve. Returns the per-seat PRNGs so the engine can drive a later mulligan
 * redraw on the same deterministic stream.
 */
export function runSetup(state: GameState, input: SetupInput): SetupResult {
  const rngs: StatefulRng[] = [];
  for (const seat of [0, 1] as const) {
    const cfg = input.seats[seat]!;
    // Reuse the already-seated placeholder PlayerState (preserving its object
    // identity, which a per-seat StateView may already reference); only create one if
    // a seat was not pre-seated. Loading the deck in place avoids invalidating views.
    const existing = state.players[seat];
    const player = existing ?? new PlayerState();
    player.sessionId = cfg.sessionId;
    player.displayName = cfg.displayName;
    loadDeckInto(player, seat, cfg.deck, input.randomKey);
    if (existing === undefined) state.players[seat] = player;

    const rng = makeRng(seatSeed(input.seed, seat), input.randomKey);
    rngs[seat] = rng;
    shuffleDecks(player, rng, (deck) => input.onShuffled?.(seat, deck));
    dealOpeningHand(player);
  }

  state.turnSeat = input.firstSeat;
  state.isFirstPlayersFirstTurn = true;
  state.memory = 0;
  state.turnCount = 0;

  return {
    rngForSeat: (seat: Seat) => rngs[seat]!,
  };
}

/**
 * Finish setup after the mulligan window: set each seat's security stack from the top
 * of its (post-mulligan) deck (§5-2-1-6). Call once both seats have decided their
 * mulligan. Separated from {@link runSetup} so a redraw can occur in between.
 */
export function finalizeSecurity(state: GameState): void {
  for (const seat of [0, 1] as const) {
    const player = state.players[seat];
    if (player !== undefined) setSecurityStack(player);
  }
}
