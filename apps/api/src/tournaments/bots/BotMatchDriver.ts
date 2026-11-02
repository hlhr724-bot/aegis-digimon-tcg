import { BotDifficulty } from "@aegis/shared/bot/BotDifficulty";
import { BotStyle } from "@aegis/shared/bot/BotStyle";
import type { AccountStore } from "../../accounts/AccountStore.js";
import type { BotOptions } from "../../bot/BotPlayer.js";
import { isBotProfileName, type BotProfileName } from "../../bot/profiles.js";
import type { SeriesRecord, SeriesStore } from "../series/index.js";

/**
 * The part of a room this driver needs. Deliberately tiny: the driver has no business knowing what
 * else `AegisRoom` can do, and a test can stand up a real room without a matchmaker behind it.
 */
export interface BotSeatableRoom {
  readonly roomId: string;
  seatTournamentBot(input: { gameId: string; authorizationToken: string; botOptions?: BotOptions }): Promise<boolean>;
}

/**
 * How the driver gets hold of the room a game is played in.
 *
 * Production resolves this through the Colyseus matchmaker and the live room registry
 * (`colyseusBotRoomGateway`); tests construct rooms directly. Either way the contract is the same:
 * hand back the room already bound to this game, or make one, or report that neither is possible.
 */
export interface BotRoomGateway {
  roomForGame(input: { gameId: string; tournamentId: string }): Promise<BotSeatableRoom | undefined>;
}

export type BotDriveOutcome =
  /** The confrontation has an outcome; `series` carries it. */
  | { kind: "resolved"; series: SeriesRecord }
  /** No seat in this match belongs to a bot, so there is nothing to drive. */
  | { kind: "no_bot_seat" }
  /** The bot is present and waiting; the human has not arrived yet. */
  | { kind: "waiting_for_opponent" }
  /** A game is under way, or has just been opened. Nothing more to do until it finishes. */
  | { kind: "playing" | "seated"; series: SeriesRecord }
  /** Gave up before the confrontation resolved. Never an outcome — only a reason to look. */
  | { kind: "abandoned"; reason: string };

export type BotSeat = {
  seat: 0 | 1;
  participantId: string;
  profile: BotProfileName;
};

export interface BotMatchDriverOptions {
  /** Passed to every seated bot. Tests replace the think delay; production leaves it alone. */
  botOptions?: Omit<BotOptions, "profile">;
  /** How long to wait between polls of the persisted state. */
  pollIntervalMs?: number;
  /** Upper bound on polls, so a confrontation that never progresses ends as `abandoned`. */
  maxPolls?: number;
  /** Seam for the wait, so a test does not spend real seconds on it. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_POLL_INTERVAL_MS = 500;
const DEFAULT_MAX_POLLS = 600;
/** Caps the backoff at 2^5 = 32 poll intervals — long enough to be cheap, short enough to react. */
const MAX_BACKOFF_STEPS = 5;

/**
 * Plays a bot's side of a tournament confrontation, from presence to the last game.
 *
 * The driver is the only thing in the system that acts on a bot's behalf, and it acts entirely
 * through the same doors a person goes through: it marks the bot present, asks the series module
 * for an authorization for exactly the next game, and redeems that authorization to take a seat.
 * There is no bypass anywhere in it — take the series module away and the driver can do nothing.
 *
 * It handles both shapes a bot-involved confrontation takes:
 *
 *  - **Human versus bot** — the person joins through the ordinary Colyseus flow, and the bot takes
 *    the other seat of the same room. The room starts once both seats are filled.
 *  - **Bot versus bot** — both seats are driven here and the confrontation runs unattended, with no
 *    client connected at any point.
 *
 * Everything it does is idempotent against the persisted state, so a driver restarted mid-series
 * picks the confrontation up where it was rather than replaying it: presence is
 * first-arrival-wins, an authorization only ever names the next unfinished game, and a game already
 * bound to a room is re-entered rather than re-created.
 */
export class BotMatchDriver {
  private readonly pollIntervalMs: number;
  private readonly maxPolls: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly accounts: AccountStore,
    private readonly series: SeriesStore,
    private readonly gateway: BotRoomGateway,
    private readonly options: BotMatchDriverOptions = {},
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.maxPolls = options.maxPolls ?? DEFAULT_MAX_POLLS;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** Which seats of a match are bots, and which personality each plays. */
  async botSeats(matchId: string): Promise<BotSeat[]> {
    await this.accounts.ensureReady();
    const match = (
      await this.accounts.pool.query<{
        tournament_id: string;
        player0_participant_id: string | null;
        player1_participant_id: string | null;
      }>("SELECT tournament_id, player0_participant_id, player1_participant_id FROM tournament_matches WHERE id=$1", [
        matchId,
      ])
    ).rows[0];
    if (!match) return [];
    const seats: BotSeat[] = [];
    for (const [index, participantId] of [match.player0_participant_id, match.player1_participant_id].entries()) {
      if (!participantId) continue;
      const row = (
        await this.accounts.pool.query<{ kind: string; bot_profile: string | null }>(
          "SELECT kind, bot_profile FROM tournament_participants WHERE id=$1",
          [participantId],
        )
      ).rows[0];
      if (row?.kind !== "bot") continue;
      const profile = row.bot_profile;
      seats.push({
        seat: index as 0 | 1,
        participantId,
        profile: profile && isBotProfileName(profile) ? profile : BotStyle.BALANCED.value,
      });
    }
    return seats;
  }

  /**
   * Drives every bot seat of one confrontation until the series resolves.
   *
   * `winsRequired` and `seriesDurationMs` come from the tournament's frozen rules snapshot and are
   * the caller's to choose, exactly as they are for a human marking themselves present: which of
   * the swiss / top-cut / final clocks applies is phase context this module does not own.
   */
  async driveMatch(input: {
    tournamentId: string;
    matchId: string;
    winsRequired: number;
    seriesDurationMs: number | null;
    /** Give up instead of waiting when the opponent is not present yet. */
    waitForOpponent?: boolean;
  }): Promise<BotDriveOutcome> {
    const seats = await this.botSeats(input.matchId);
    if (seats.length === 0) return { kind: "no_bot_seat" };

    // Backoff, so a confrontation that is going nowhere — a person who never arrives, a room on
    // another container — costs a query every few seconds rather than one every few milliseconds.
    // Any step that changed something resets it, so an active series is still polled tightly.
    let idle = 0;
    for (let poll = 0; poll < this.maxPolls; poll += 1) {
      const step = await this.advanceMatch(input, seats);
      if (step.kind === "resolved" || step.kind === "abandoned" || step.kind === "no_bot_seat") return step;
      if (step.kind === "waiting_for_opponent" && input.waitForOpponent === false) return step;
      idle = step.kind === "seated" ? 0 : Math.min(idle + 1, MAX_BACKOFF_STEPS);
      await this.sleep(this.pollIntervalMs * 2 ** idle);
    }
    return { kind: "abandoned", reason: "poll_budget_exhausted" };
  }

  /**
   * Takes the confrontation ONE step forward and returns, without waiting for anything.
   *
   * This is what a sweep calls. A tick of the deadline worker must not sit inside a bot's game — a
   * best-of-three between two bots is minutes of play — so the sweep nudges each bot-involved
   * match and comes back on the next tick to nudge it again. All the state that matters is
   * persisted, so "where were we" is a question the database answers rather than a loop's local
   * variables.
   *
   * `seats` is accepted so a caller that already read them does not read them twice.
   */
  async advanceMatch(
    input: {
      tournamentId: string;
      matchId: string;
      winsRequired: number;
      seriesDurationMs: number | null;
    },
    knownSeats?: readonly BotSeat[],
  ): Promise<BotDriveOutcome> {
    const seats = knownSeats ?? (await this.botSeats(input.matchId));
    if (seats.length === 0) return { kind: "no_bot_seat" };

    const presence = await this.markBotsPresent(input, seats);
    if (!presence) return { kind: "abandoned", reason: "match_not_found" };
    const series = presence.series;
    // The bot is present and the confrontation has not started, which means the person has not
    // arrived. Waiting is the whole behaviour: a bot never starts a series on its own.
    if (!series) return { kind: "waiting_for_opponent" };
    if (series.status === "resolved" || series.status === "needs_organizer_decision")
      return { kind: "resolved", series };

    // A game already bound to a room is being played. Re-authorizing would mint a second token for
    // a seat that is already sitting in it.
    if (series.games.some((game) => game.status === "room_claimed" || game.status === "playing"))
      return { kind: "playing", series };

    const opened = await this.openNextGame(series, seats);
    // Every decisive game is spent and the score has not settled it; only the clock can, and that
    // is the scheduler's business, not this driver's.
    if (opened === "no_games_remaining") return { kind: "playing", series };
    return { kind: opened === "seated" ? "seated" : "playing", series };
  }

  private async markBotsPresent(
    input: { tournamentId: string; matchId: string; winsRequired: number; seriesDurationMs: number | null },
    seats: readonly BotSeat[],
  ): Promise<{ series: SeriesRecord | undefined } | undefined> {
    let last: { series: SeriesRecord | undefined } | undefined;
    for (const seat of seats) {
      const marked = await this.series.markPresent({
        tournamentId: input.tournamentId,
        matchId: input.matchId,
        participantId: seat.participantId,
        winsRequired: input.winsRequired,
        seriesDurationMs: input.seriesDurationMs,
      });
      if (!marked.ok) return undefined;
      last = { series: marked.value.series };
    }
    return last;
  }

  /**
   * Puts every bot seat into the series' next game.
   *
   * The room is resolved once and shared, because both seats of one game must be the same room —
   * that is exactly what the game's unique room binding enforces, and asking the gateway per seat
   * would just discover the same room twice.
   */
  private async openNextGame(
    series: SeriesRecord,
    seats: readonly BotSeat[],
  ): Promise<"seated" | "no_games_remaining" | "retry"> {
    const authorizations: { seat: BotSeat; gameId: string; token: string }[] = [];
    for (const seat of seats) {
      const issued = await this.series.authorizeNextGame({ seriesId: series.id, participantId: seat.participantId });
      if (issued.ok) {
        authorizations.push({ seat, gameId: issued.value.gameId, token: issued.value.token });
        continue;
      }
      if (issued.reason === "no_games_remaining") return "no_games_remaining";
      // `authorization_live` means this seat is already holding a usable token — most often because
      // the driver was restarted. Waiting for it to expire is the safe move; re-issuing would leave
      // two live tokens for one seat.
      return "retry";
    }
    if (authorizations.length === 0) return "retry";

    const room = await this.gateway.roomForGame({
      gameId: authorizations[0]!.gameId,
      tournamentId: series.tournamentId,
    });
    if (!room) return "retry";
    for (const authorization of authorizations)
      await room.seatTournamentBot({
        gameId: authorization.gameId,
        authorizationToken: authorization.token,
        botOptions: {
          ...this.options.botOptions,
          profile: authorization.seat.profile,
          difficulty: BotDifficulty.STANDARD.value,
        },
      });
    return "seated";
  }
}
