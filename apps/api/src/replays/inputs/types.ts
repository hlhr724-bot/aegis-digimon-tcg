import type { TournamentBanlistCard } from "@aegis/shared/tournaments/index";
import type { GameMode } from "@aegis/shared/manual/GameMode";
import type { DeckFormat, Intent, Seat } from "@aegis/shared";
import type { ScenarioFixture } from "../../engine/scenario/types.js";

/**
 * A match replay: everything needed to rebuild one match on a fresh engine and feed it the same
 * inputs in the same order, and nothing else.
 *
 * It is sanitized by construction. {@link extractReplay} builds it field by field from the room's
 * `replay.*` and `intent.*` log lines, so chat, session ids, display names, account ids, room codes
 * and client metadata never reach it: there is no field for them to land in.
 */
export const REPLAY_FORMAT = "aegis-replay-inputs/1";

export interface ReplayRecord {
  format: typeof REPLAY_FORMAT;
  /** The room's `state.matchLogId`, i.e. the `matchId` of every log line of the match. */
  matchId: string;
  /** `AEGIS_REVISION` of the server that played the match, when it was set. */
  serverRevision?: string;
  /** The engine seed (`GameEngineHooks.seed`): shuffles, first player and every seeded choice. */
  seed: number;
  randomKey?: string;
  /** The first player the room imposed (a later game of a casual series). Otherwise the seed decides. */
  firstSeat?: Seat;
  /** Room-level rules mirrored into the state, and the dev scenario a non-production bot room laid. */
  rules: ReplayRules;
  /** The deck each seat started the match with (the last seating of each seat). */
  seats: [ReplaySeat, ReplaySeat];
  /** Every input that changed engine state, in the order the room applied it. */
  inputs: ReplayInput[];
}

export interface ReplayRules {
  gameMode?: GameMode;
  deckFormat: DeckFormat;
  unlimited: boolean;
  betaBattle: boolean;
  devScenario?: string;
}

export interface ReplayDeck {
  mainDeck: string[];
  eggDeck: string[];
  mainDeckArts?: string[];
  eggDeckArts?: string[];
}

/** The deck-legality options the room passed to `seatPlayer` with the deck. */
export interface ReplayDeckRules {
  banlistCards?: readonly TournamentBanlistCard[];
  betaBattleMode?: boolean;
  unlimited?: boolean;
  format?: DeckFormat;
}

export interface ReplaySeat {
  deck: ReplayDeck;
  bot?: true;
}

/**
 * One engine input. `stateVersion` is the room's `state.stateVersion` and `engineEvents` the number
 * of events the engine had emitted when the input arrived; together they place the input in the
 * match even where the room applied it in the middle of an engine resolution (see {@link ReplaySite}).
 *
 * Besides the intents and the room's own engine calls, seating and match start are inputs too: a
 * seat can be re-filled before the match starts (a departed player's replacement), and the match
 * can start from the ready gate, the ready timeout or a bot join, so their position matters.
 */
export type ReplayInput =
  | ({ kind: "seat"; seat: Seat; deck: ReplayDeck; deckRules: ReplayDeckRules; bot?: true } & Placed)
  | ({
      kind: "intent";
      seat: Seat;
      intent: Intent;
      /** The recorded outcome; absent when the engine threw (`threw`) or the log was cut short. */
      ok?: boolean;
      reason?: string;
      threw?: true;
    } & Placed)
  | (ReplayRoomInput & Placed & { site?: ReplaySite });

/** The inputs the room itself issues to the engine, outside any intent or seating. */
export type ReplayRoomInput =
  | { kind: "startMatch" }
  | { kind: "startDevScenario"; scenario: string }
  | { kind: "startScenarioFixture"; fixture: ScenarioFixture }
  /** `final` is a departure (a concession once the match has started); otherwise the seat only dropped. */
  | { kind: "disconnect"; seat: Seat; final: boolean }
  | { kind: "reconnect"; seat: Seat }
  | { kind: "clearReady"; seat: Seat }
  | { kind: "expireRankedRound" }
  | { kind: "expireMatchTimer"; seat: Seat }
  /** The mulligan window ran out: the room keeps the seat's hand (`mulligan` with `keep: true`). */
  | { kind: "expireMulliganWindow"; seat: Seat }
  | { kind: "expireCombatWindow" };

/**
 * Where a room input was issued synchronously from inside the room's own handling of the engine,
 * instead of from an idle engine:
 *
 * - `bothReady`: the engine's `onBothReady` hook (the second `ready` starts the match);
 * - `batchClose`: a batch closing, which runs the match clock and `broadcastPatch`, and
 *   `broadcastPatch` ticks the room clock, firing any due room timer (combat-window timeout,
 *   match-clock interval) right there, possibly mid-resolution;
 * - `decisionRequest` / `matchStarted`: the other two `broadcastPatch` calls;
 * - `afterIntent`: the match clock checked right after an intent returned.
 *
 * Inputs without a site arrived while the engine was idle (a message, a timer between ticks).
 */
export type ReplaySite = "beforeTurn" | "bothReady" | "batchClose" | "decisionRequest" | "matchStarted" | "afterIntent";

interface Placed {
  stateVersion: number;
  /** Absent in records from before it was logged; the position check is then skipped. */
  engineEvents?: number;
}

export type ReplayInputKind = ReplayInput["kind"];

/** Something the replay did differently from the recorded match. */
export interface ReplayDivergence {
  /** Index into {@link ReplayRecord.inputs}. */
  index: number;
  kind: "intent-result" | "state-version" | "event-count" | "position" | "threw";
  inputKind: ReplayInputKind;
  seat?: Seat;
  intentType?: Intent["type"];
  expected: unknown;
  actual: unknown;
  /** The replayed engine's rejection reason or thrown message, when there is one. */
  reason?: string;
  message: string;
}

/*
 * The log lines the room writes for the replay (the payload after the line name). The room and
 * the extractor share these so the format has one definition. `replaySeq` is a per-room ordinal:
 * the extractor orders by it rather than by file position, because log segments are named
 * `api-<date>-<uuid>.jsonl` and their names do not sort chronologically.
 */

/** `replay.header`, written once when the room builds its engine. */
export interface ReplayHeaderLine {
  gameMode?: GameMode;
  replaySeq: number;
  seed: number;
  randomKey?: string;
  firstSeat?: Seat;
  serverRevision?: string;
  deckFormat: DeckFormat;
  unlimited: boolean;
  betaBattle: boolean;
  devScenario?: string;
}

/** `replay.seat`, written after a seat is given a deck. */
export interface ReplaySeatLine {
  replaySeq: number;
  seat: Seat;
  deck: ReplayDeck;
  deckRules: ReplayDeckRules;
  bot?: true;
  stateVersion: number;
  engineEvents: number;
}

/** `replay.input`, written before a room-issued engine input is applied. */
export type ReplayInputLine = ReplayRoomInput & {
  replaySeq: number;
  stateVersion: number;
  engineEvents: number;
  site?: ReplaySite;
};

/*
 * `intent.received` / `intent.result` / `intent.failed` keep their existing shape; the room adds
 * `replaySeq` to all three (the result is matched to its intent by it) and `engineEvents` to
 * `intent.received`.
 */
