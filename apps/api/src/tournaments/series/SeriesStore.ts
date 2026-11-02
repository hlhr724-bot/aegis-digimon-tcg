import { recordTournamentGameFacts } from "#api/ranked/recordTournamentGameFacts";
import { advanceSeriesDeadline } from "#api/tournaments/scheduler/advanceSeriesDeadline";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  GameStatus,
  MatchStatus,
  PairingReason,
  ParticipantKind,
  SeriesScoreView,
  SwissTimeoutPolicy,
} from "@aegis/shared";
import type { PoolClient } from "pg";
import type { AccountStore } from "../../accounts/AccountStore.js";
import type { AuthoritativeGameResult, ClaimTournamentGame, GameAuthorization } from "../TournamentManager.js";
import {
  type AcquireTournamentLock,
  inProcessTournamentLock,
  type ParticipantDeckSnapshot,
} from "../participants/index.js";
// Imported from the module rather than the scheduler barrel on purpose: the scheduler's command
// layer imports this store back, and going through the barrel would close that cycle.
import { derivedUuid, insertDeadline, retireDeadlines } from "../scheduler/DeadlineQueue.js";
import { appendTournamentEvent } from "../audit/index.js";

export type SeriesStatus = "playing" | "overtime" | "resolved" | "needs_organizer_decision";
export type SeriesOfficialResult = "participant0" | "participant1" | "draw" | "double_loss" | "voided";
export type GameResult = "participant0" | "participant1" | "draw" | "voided";

/**
 * How a series ends when its shared clock runs out. Swiss carries the tie rule from the frozen
 * rules snapshot; elimination carries none, because no elimination confrontation may end tied and
 * the state tiebreak the manual calls for needs game-state metrics the room does not expose yet.
 * Until it does, the honest outcome is a pause for an audited organizer decision, never an
 * invented winner.
 */
export type SeriesTimeoutPolicy = { kind: "swiss"; onTie: SwissTimeoutPolicy } | { kind: "elimination" };

export type SeriesFailure =
  | "match_not_found"
  | "match_not_ready"
  | "tournament_cancelled"
  | "not_a_participant"
  | "series_not_found"
  | "series_already_resolved"
  | "no_games_remaining"
  | "authorization_live"
  | "authorization_invalid"
  | "authorization_expired"
  | "authorization_consumed"
  | "game_not_found"
  | "game_already_claimed"
  | "game_already_finished"
  | "deck_not_frozen"
  | "room_mismatch"
  | "deadline_not_reached"
  | "no_deadline"
  | "presence_changed";

export type SeriesResult<T> = { ok: true; value: T } | { ok: false; reason: SeriesFailure };

/**
 * Who occupies a seat. A human is named by their Account, which is what every existing caller — the
 * HTTP surface, the room, the legacy bracket — already has. A bot has no Account and is named by
 * its participant row instead.
 *
 * The asymmetry is deliberate and is the whole security story for bot seats: an account holder is
 * identified by a session, so `{ kind: "account" }` can be derived from a request. A participant id
 * cannot be derived from any request, so `{ kind: "bot" }` is only ever constructed server-side, by
 * the code that seated the bot in the first place. Nothing over HTTP or over the Colyseus join
 * builds one.
 */
export type SeriesSeatHolder = { kind: "account"; accountId: string } | { kind: "bot"; participantId: string };

/** Accepts the field an existing caller already passes, or the bot form. Exactly one must be set. */
export type SeatHolderInput = { accountId: string; participantId?: undefined } | { participantId: string };

function holderOf(input: SeatHolderInput): SeriesSeatHolder {
  return "accountId" in input && input.accountId !== undefined
    ? { kind: "account", accountId: input.accountId }
    : { kind: "bot", participantId: (input as { participantId: string }).participantId };
}

/** Told that one confrontation ended, whichever way it ended. See {@link SeriesStore.onResolved}. */
export type SeriesResolutionListener = (event: {
  matchId: string;
  seriesId: string;
  tournamentId: string;
}) => void | Promise<void>;

export type GameRecord = {
  id: string;
  seriesId: string;
  gameIndex: number;
  roomId: string | null;
  status: GameStatus;
  result: GameResult | null;
  resultReason: string | null;
  allocatedAt: number;
  claimedAt: number | null;
  finishedAt: number | null;
  /**
   * The deck each seat actually played this game with, copied from the participant's frozen snapshot
   * when the room claimed the seat. Null for a seat that never entered, and for every game played
   * before the column existed. This — not `tournament_participants.deck_snapshot` — is what the
   * record of a PLAYED game means: the participant row keeps moving, this one does not.
   */
  deckSnapshots: [ParticipantDeckSnapshot | null, ParticipantDeckSnapshot | null];
};

export type SeriesRecord = {
  id: string;
  matchId: string;
  tournamentId: string;
  participantAccountIds: [string | null, string | null];
  /** The participant row behind each seat. Populated for bots, and for humans the program bracket seats. */
  participantIds: [string | null, string | null];
  winsRequired: number;
  wins: [number, number];
  status: SeriesStatus;
  startedAt: number;
  seriesDeadlineAt: number | null;
  officialResult: SeriesOfficialResult | null;
  resolutionReason: string | null;
  resolvedAt: number | null;
  version: number;
  games: GameRecord[];
};

/**
 * What every administrative decision needs, including the presence it was decided on.
 *
 * `expectedAbsentSeats` is the important field. The caller decides what to do from a read of
 * presence taken OUTSIDE any transaction, and presence can change in the gap — both players
 * arriving between the read and the write is exactly how a just-started series would otherwise be
 * killed by a penalty aimed at the empty table that preceded it. So the decision travels with the
 * presence it assumed, this module re-derives presence under `FOR UPDATE`, and a mismatch refuses
 * the command rather than applying it. The caller's remedy is to look again, not to force it.
 *
 * `alwaysPresentSeats` covers seats that cannot arrive because nobody has to: a bot is seated by
 * the server, so it is at the table by definition. It is static input rather than a lookup here,
 * because unlike presence it cannot change while the command runs.
 */
export type AdministrativeCommand = {
  tournamentId: string;
  matchId: string;
  reason: string;
  winsRequired: number;
  seriesDurationMs: number | null;
  expectedAbsentSeats?: readonly (0 | 1)[];
  alwaysPresentSeats?: readonly (0 | 1)[];
  /**
   * The deadline row that ordered this, when one did. It is what makes the command idempotent —
   * the synthetic game's key derives from it — and it is excluded when a decision retires the
   * deadlines watching the confrontation, so a row never cancels the outcome it is producing.
   */
  commandId?: string;
  now?: number;
};

export type MatchPresence = {
  matchId: string;
  tournamentId: string;
  participantAccountIds: [string | null, string | null];
  participantIds: [string | null, string | null];
  presentAt: [number | null, number | null];
  joinDeadlineAt: number | null;
  series: SeriesRecord | undefined;
};

/**
 * What a room learns from an authorization. The account, its display name and the deck it froze at
 * check-in all travel with the token, so a tournament room needs no second credential to know who
 * just joined and needs no client input to know what they may play.
 */
export type GameEntry = {
  authorization: GameAuthorization;
  /**
   * Null for a bot seat, which has no Account. A caller that seats a network client MUST refuse a
   * null here: it means the authorization belongs to a bot and was never meant to travel to a
   * client at all.
   */
  accountId: string | null;
  /** Set for a bot seat; also set for a human whose seat the program bracket knows by participant. */
  participantId: string | null;
  kind: ParticipantKind;
  displayName: string;
  deck: ParticipantDeckSnapshot;
  /** Rows the claim path writes through. Internal; a caller has no use for it. */
  binding: { authorization: AuthorizationRow; game: GameRecord; replaying: boolean; seat: 0 | 1 };
};

export type ClaimedGame = GameEntry;

/**
 * A room reporting an outcome that contradicts the one already recorded for the same game. This is
 * never a race to absorb quietly: two different authoritative results for one game mean either two
 * rooms played it or a room replayed it, and both are corruption of the tournament record.
 */
export class ConflictingGameResultError extends Error {
  constructor(
    readonly gameId: string,
    readonly recorded: GameResult,
    readonly reported: GameResult,
  ) {
    super(`game ${gameId} is already ${recorded}; refusing to record ${reported}`);
  }
}

/** How long an issued authorization can be redeemed for. */
export const AUTHORIZATION_TTL_MS = 120_000;

const OPEN_GAME_STATUSES: readonly GameStatus[] = ["allocated", "room_claimed", "playing"];
const CLOSED_SERIES_STATUSES: readonly SeriesStatus[] = ["resolved", "needs_organizer_decision"];

/**
 * The confrontation layer: presence, the shared clock, per-game authorization, and the score.
 *
 * The whole point of this module is that a game does not know it is part of a series and a room
 * does not know which game it is running. `AegisRoom` validates one authorization, plays one game
 * and reports one result; every decision that follows — whether another game opens, whether the
 * confrontation is over, what the timeout means — is made here, from persisted state.
 *
 * The clock is the invariant to protect: `series_deadline_at` is written once, when both players
 * are present, and no later operation touches it. Game 2 therefore inherits the deadline by having
 * nowhere else to read it from, rather than by a caller remembering to copy it.
 *
 * Shares the AccountStore's pool and migration run rather than opening a second one.
 */
export class SeriesStore {
  private readonly resolutionListeners: SeriesResolutionListener[] = [];

  constructor(
    private readonly accounts: AccountStore,
    private readonly acquireLock: AcquireTournamentLock = inProcessTournamentLock(),
  ) {}

  /**
   * Registers who is told that a confrontation ended.
   *
   * This module deliberately knows nothing about rounds — closing one is the program's business —
   * but it is the only place that knows WHEN a confrontation ends, whichever way it ended. The
   * listener is called after the transaction commits, never inside it: the round close it triggers
   * opens its own transaction, and nesting the two on one client would deadlock. A listener that
   * throws is logged and swallowed, because a room reporting a legitimate game result must not be
   * failed by a downstream projection.
   *
   * Registered rather than injected because a listener needs this store to exist first. Idempotent
   * consumers are mandatory: the same resolution may be announced more than once.
   *
   * A LIST rather than one slot, because more than one thing legitimately reacts to a resolution —
   * a Swiss round asking whether it can close, an elimination bracket advancing a winner — and one
   * of them silently replacing the other is a whole format quietly not progressing. Each listener
   * is called in turn and each failure is logged on its own: one broken projection must not stop
   * the others being told.
   */
  addResolutionListener(listener: SeriesResolutionListener): void {
    this.resolutionListeners.push(listener);
  }

  /**
   * Records that a confrontation ended, whichever way it ended, in the audit ledger.
   *
   * This is the ordinary case — a series settled by the games people actually played — and it is in
   * the trail for the same reason the exceptional cases are: a ledger holding only no-shows and
   * judge rulings can explain an unusual result but cannot rebuild the tournament from itself.
   *
   * Written here, in the one place every resolution passes through, rather than in each of the four
   * writers that can settle a series. Post-commit and on its own connection: the resolution is
   * already durable by this point and a failing trail must never undo a played-out result.
   *
   * The command id carries the series' `version`, which increments on every close. That is what lets
   * a CORRECTED result append a second resolution event instead of being swallowed as a replay of
   * the first — the trail keeps both, and a replay takes the last one per series, which is what
   * makes a correction reconstructible rather than invisible.
   */
  private async recordResolution(series: SeriesRecord): Promise<void> {
    try {
      await appendTournamentEvent(this.accounts.pool, {
        tournamentId: series.tournamentId,
        actorKind: "system",
        actorId: "system",
        command: "series_resolved",
        commandId: `series_resolved:${series.id}:${series.version}`,
        reason: series.resolutionReason ?? "the confrontation resolved",
        reasonCode: series.resolutionReason ?? "series_resolved",
        subjectKind: "series",
        subjectId: series.id,
        seriesId: series.id,
        matchId: series.matchId,
        after: { status: series.status, officialResult: series.officialResult, wins: series.wins },
        now: series.resolvedAt ?? Date.now(),
      });
    } catch (error) {
      console.error(`[SeriesStore] could not record the resolution of series ${series.id}`, error);
    }
  }

  private async announceIfResolved(result: SeriesResult<SeriesRecord>): Promise<void> {
    if (!result.ok) return;
    if (result.value.status !== "resolved") return;
    await this.recordResolution(result.value);
    if (this.resolutionListeners.length === 0) return;
    const event = {
      matchId: result.value.matchId,
      seriesId: result.value.id,
      tournamentId: result.value.tournamentId,
    };
    for (const listener of this.resolutionListeners) {
      try {
        await listener(event);
      } catch (error) {
        console.error(`[SeriesStore] resolution listener failed for series ${result.value.id}`, error);
      }
    }
  }

  /**
   * Records that one participant has arrived, and starts the series once both have.
   *
   * `winsRequired` and `seriesDurationMs` come from the tournament's frozen rules snapshot, chosen
   * by the caller: which of the swiss / top-cut / final durations applies is phase context this
   * slice does not own yet. A null duration means the format runs untimed.
   *
   * Presence is first-arrival-wins, so calling this twice never moves the clock: the second call
   * reports the same state the first produced.
   *
   * `tournamentId` is not decoration: the caller reads `winsRequired` and the duration out of ONE
   * tournament's frozen ruleset, so the match had better belong to that tournament. Without the
   * check, anybody seated in a real match could create their own event with a best-of-one, untimed
   * preset and, by arriving second through it, start the real series under those rules. A match
   * that belongs to a different tournament reads as absent rather than forbidden, so the endpoint
   * cannot be used to probe which match ids exist.
   */
  async markPresent(
    input: {
      tournamentId: string;
      matchId: string;
      winsRequired: number;
      seriesDurationMs: number | null;
      now?: number;
    } & SeatHolderInput,
  ): Promise<SeriesResult<MatchPresence>> {
    const now = input.now ?? Date.now();
    const holder = holderOf(input);
    return this.mutate(input.matchId, async (client) => {
      const match = await lockMatch(client, input.matchId);
      if (!match || match.tournamentId !== input.tournamentId) return failure("match_not_found");
      if (await this.isTournamentCancelled({ db: client, tournamentId: match.tournamentId })) {
        return failure("tournament_cancelled");
      }
      if (match.status === "waiting") {
        return failure("match_not_ready");
      }
      const seat = seatOf(match, holder);
      if (seat === undefined) return failure("not_a_participant");

      if (match.presentAt[seat] === null) {
        await client.query(`UPDATE tournament_matches SET player${seat}_present_at=$1 WHERE id=$2`, [
          now,
          match.matchId,
        ]);
        match.presentAt[seat] = now;
      }

      let series = await readSeriesByMatch(client, match.matchId);
      if (!series && match.presentAt[0] !== null && match.presentAt[1] !== null)
        series = await this.createSeries(client, match, input.winsRequired, input.seriesDurationMs, now);
      return ok({ ...match, series });
    });
  }

  /**
   * Issues a short-lived authorization for exactly the series' next unfinished game, allocating
   * that game if it does not exist yet.
   *
   * Issued per participant, not per series: both players must enter the same room, and a single
   * shared single-use token would let whichever of them redeemed it first lock the other out. The
   * "one live authorization per series" rule still holds, one level up — an authorization only ever
   * names the next unfinished game, so two games of one series can never be enterable at once.
   *
   * A caller whose own authorization is still live is refused rather than handed a second one;
   * re-issue waits for it to expire, be consumed, or for the game to be voided.
   */
  async authorizeNextGame(
    input: {
      seriesId: string;
      now?: number;
      ttlMs?: number;
    } & SeatHolderInput,
  ): Promise<SeriesResult<GameAuthorization>> {
    const now = input.now ?? Date.now();
    const ttl = input.ttlMs ?? AUTHORIZATION_TTL_MS;
    const holder = holderOf(input);
    return this.mutate(input.seriesId, async (client) => {
      const series = await lockSeries(client, input.seriesId);
      if (!series) return failure("series_not_found");
      if (await this.isTournamentCancelled({ db: client, tournamentId: series.tournamentId })) {
        return failure("tournament_cancelled");
      }
      if (CLOSED_SERIES_STATUSES.includes(series.status)) return failure("series_already_resolved");
      const seat = seatOfSeries(series, holder);
      if (seat === undefined) return failure("not_a_participant");
      if (series.status === "overtime") return failure("no_games_remaining");

      const game = await this.nextGame(client, series, now);
      if (!game) return failure("no_games_remaining");
      if (await hasLiveAuthorization(client, game.id, holder, now)) return failure("authorization_live");

      const token = randomBytes(32).toString("base64url");
      await client.query(
        `INSERT INTO tournament_game_authorizations (token_hash, game_id, account_id, participant_id, issued_at, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          hash(token),
          game.id,
          holder.kind === "account" ? holder.accountId : null,
          holder.kind === "bot" ? holder.participantId : null,
          now,
          now + ttl,
        ],
      );
      return ok(toAuthorization(series, game, token, now + ttl));
    });
  }

  /**
   * Validates an authorization and reports who it belongs to and what deck they froze — WITHOUT
   * binding a room or consuming anything.
   *
   * This exists so a room can run its own cheap checks (name, seat already taken, room type) before
   * taking any exclusive claim. A claim made before a rejection would pin a Tournament Game to a
   * room nobody ever entered, and the UNIQUE room_id means no second room could ever pick it up.
   */
  async inspectAuthorization(input: {
    gameId: string;
    authorizationToken: string;
    roomId: string;
    now?: number;
  }): Promise<SeriesResult<GameEntry>> {
    const now = input.now ?? Date.now();
    const seriesId = await this.seriesIdForGame(input.gameId);
    if (!seriesId) return failure("game_not_found");
    await this.accounts.ensureReady();
    return this.entryFor(this.accounts.pool, input, now, "inspect");
  }

  /**
   * Binds a room to the authorized game. The first participant to arrive claims the room; the
   * second finds it already claimed by that same room and is admitted. Any other room is refused,
   * so one game can never be played twice.
   */
  async claimGame(input: ClaimTournamentGame & { now?: number }): Promise<SeriesResult<ClaimedGame>> {
    const now = input.now ?? Date.now();
    const seriesId = await this.seriesIdForGame(input.gameId);
    if (!seriesId) return failure("game_not_found");
    return this.mutate(seriesId, async (client) => {
      const entry = await this.entryFor(client, input, now, "claim");
      if (!entry.ok) return entry;
      const { authorization, game, replaying, seat } = entry.value.binding;

      // The deck this seat is being handed, recorded on the game before any card is played and
      // never rewritten afterwards — a reconnect finds the column already set and leaves it alone.
      // Writing it here rather than at `markGamePlaying` is deliberate: this is the transaction
      // that decides the seat may play at all, and the deck it decided on is the deck that played.
      if (game.deckSnapshots[seat] === null) {
        await client.query(
          `UPDATE tournament_games SET player${seat}_deck_snapshot=$1 WHERE id=$2 AND player${seat}_deck_snapshot IS NULL`,
          [JSON.stringify(entry.value.deck), game.id],
        );
        game.deckSnapshots[seat] = entry.value.deck;
      }

      if (game.roomId === null) {
        const bound = await client.query(
          "UPDATE tournament_games SET room_id=$1, status='room_claimed', claimed_at=$2 WHERE id=$3 AND room_id IS NULL",
          [input.roomId, now, game.id],
        );
        if (bound.rowCount !== 1) return failure("game_already_claimed");
        game.roomId = input.roomId;
      }
      if (!replaying)
        await client.query(
          "UPDATE tournament_game_authorizations SET consumed_at=$1, consumed_room_id=$2 WHERE token_hash=$3",
          [now, input.roomId, authorization.token_hash],
        );
      return ok(entry.value);
    });
  }

  /**
   * Everything an authorization asserts, validated once and shared by {@link inspectAuthorization}
   * and {@link claimGame} so the two can never disagree about who may enter a room.
   *
   * The deck comes from `tournament_participants.deck_snapshot`, frozen when check-in closed. A
   * tournament game is played with the deck the participant registered, full stop — the client's
   * own `deck` option is not consulted, and an account with no frozen deck cannot be seated at all.
   */
  private async entryFor(
    db: Queryable,
    input: { gameId: string; authorizationToken: string; roomId: string },
    now: number,
    mode: "inspect" | "claim",
  ): Promise<SeriesResult<GameEntry>> {
    const lock = mode === "claim" ? " FOR UPDATE" : "";
    const authorization = (
      await db.query<AuthorizationRow>(
        `SELECT token_hash, game_id, account_id, participant_id, expires_at, consumed_at, consumed_room_id
         FROM tournament_game_authorizations WHERE token_hash=$1 AND game_id=$2${lock}`,
        [hash(input.authorizationToken), input.gameId],
      )
    ).rows[0];
    if (!authorization) return failure("authorization_invalid");
    // A consumed authorization still admits the room it was consumed for: a client that
    // re-authenticates against the room it already entered is a reconnect, not a second use.
    const replaying = authorization.consumed_at !== null && authorization.consumed_room_id === input.roomId;
    if (authorization.consumed_at !== null && !replaying) return failure("authorization_consumed");
    if (!replaying && Number(authorization.expires_at) <= now) return failure("authorization_expired");

    const game = mode === "claim" ? await lockGame(db as PoolClient, input.gameId) : await readGame(db, input.gameId);
    if (!game) return failure("game_not_found");
    const series = await readSeries(db, game.seriesId);
    if (!series) return failure("series_not_found");
    if (await this.isTournamentCancelled({ db, tournamentId: series.tournamentId })) {
      return failure("tournament_cancelled");
    }
    if (game.status === "finished" || game.status === "voided") return failure("game_already_finished");
    if (game.roomId !== null && game.roomId !== input.roomId) return failure("game_already_claimed");
    if (!authorization.account_id && !authorization.participant_id) return failure("not_a_participant");

    const identity = authorization.account_id
      ? await humanIdentity(db, series.tournamentId, authorization.account_id)
      : await botIdentity(db, series.tournamentId, authorization.participant_id!);
    if (!identity) return failure("deck_not_frozen");
    const seat = seatOfSeries(
      series,
      authorization.account_id
        ? { kind: "account", accountId: authorization.account_id }
        : { kind: "bot", participantId: authorization.participant_id! },
    );
    if (seat === undefined) return failure("not_a_participant");
    return ok({
      authorization: toAuthorization(series, game, input.authorizationToken, Number(authorization.expires_at)),
      accountId: authorization.account_id,
      participantId: identity.participantId,
      kind: identity.kind,
      displayName: identity.displayName,
      deck: identity.deck,
      binding: { authorization, game, replaying, seat },
    });
  }

  /**
   * Marks the game as actually under way, once the room starts the match. Only a claimed game can
   * begin, so a late transition finds nothing to update and changes nothing.
   */
  async markGamePlaying(gameId: string, roomId: string): Promise<boolean> {
    await this.accounts.ensureReady();
    const started = await this.accounts.pool.query(
      "UPDATE tournament_games SET status='playing' WHERE id=$1 AND room_id=$2 AND status='room_claimed'",
      [gameId, roomId],
    );
    return started.rowCount === 1;
  }

  /**
   * Records one game's authoritative outcome and accumulates the series score.
   *
   * Idempotent by construction: the same game reporting the same outcome again — a retry, a
   * duplicated shutdown hook — changes nothing and succeeds. The same game reporting a DIFFERENT
   * outcome throws {@link ConflictingGameResultError}, because that can only mean the game was
   * played twice.
   *
   * A drawn game is not a win for anybody. It closes its own game slot and leaves the series open,
   * so the next game is authorized against the same, still-running clock; if the slots run out
   * first, the score as it stands is what the deadline resolves on.
   */
  async recordGameResult(input: AuthoritativeGameResult): Promise<SeriesResult<SeriesRecord>> {
    const seriesId = await this.seriesIdForGame(input.gameId);
    if (!seriesId) return failure("game_not_found");
    const result = await this.mutate<SeriesResult<SeriesRecord>>(seriesId, async (client) => {
      const game = await lockGame(client, input.gameId);
      if (!game) return failure("game_not_found");
      const series = await lockSeries(client, game.seriesId);
      if (!series) return failure("series_not_found");
      if (await this.isTournamentCancelled({ db: client, tournamentId: series.tournamentId })) {
        return failure("tournament_cancelled");
      }
      if (game.roomId !== input.roomId) return failure("room_mismatch");

      const outcome = gameResultOf(input, series);
      if (!outcome) return failure("not_a_participant");
      if (game.status === "finished" || game.status === "voided") {
        if (game.result !== outcome.result)
          throw new ConflictingGameResultError(game.id, game.result ?? "voided", outcome.result);
        return ok(series);
      }

      await client.query(
        "UPDATE tournament_games SET status=$1, result=$2, result_reason=$3, finished_at=$4 WHERE id=$5",
        [
          outcome.result === "voided" ? "voided" : "finished",
          outcome.result,
          outcome.reason,
          input.finishedAt,
          game.id,
        ],
      );
      await recordTournamentGameFacts({
        db: client,
        game,
        series,
        result: outcome.result,
        finishedAt: input.finishedAt,
      });
      const winner = outcome.result === "participant0" ? 0 : outcome.result === "participant1" ? 1 : undefined;
      const wins: [number, number] = [...series.wins];
      if (winner !== undefined) {
        wins[winner] += 1;
        await client.query(`UPDATE match_series SET wins${winner}=$1, version=version+1 WHERE id=$2`, [
          wins[winner],
          series.id,
        ]);
      }
      if (winner !== undefined && wins[winner] >= series.winsRequired)
        await this.closeSeries(client, series.id, series.matchId, {
          status: "resolved",
          officialResult: winner === 0 ? "participant0" : "participant1",
          reason: "series_won",
          at: input.finishedAt,
        });
      else if (series.status === "overtime")
        await advanceSeriesDeadline({ db: client, seriesId: series.id, dueAt: input.finishedAt });
      return ok(await this.reread(client, series.id));
    });
    await this.announceIfResolved(result);
    return result;
  }

  /**
   * Applies the timeout policy when the shared clock runs out.
   *
   * The score already on the board decides first — whoever is ahead on game wins takes the
   * confrontation. Only a genuine tie reaches the policy, and only Swiss has one that can settle
   * it. An elimination tie parks the series in `needs_organizer_decision`: the manual's state
   * tiebreak needs metrics the room does not publish yet, and guessing a winner in a cut is worse
   * than pausing for a judge.
   *
   * Idempotent: a series already resolved is returned untouched, so a scheduler that retries a
   * lease it thought it lost cannot re-resolve it.
   */
  async resolveSeriesByDeadline(input: {
    seriesId: string;
    policy: SeriesTimeoutPolicy;
    /** The deadline row driving this, so the decision does not retire the row producing it. */
    commandId?: string;
    now?: number;
    liveGameGraceMs?: number;
  }): Promise<SeriesResult<SeriesRecord>> {
    const now = input.now ?? Date.now();
    const result = await this.mutate<SeriesResult<SeriesRecord>>(input.seriesId, async (client) => {
      const series = await lockSeries(client, input.seriesId);
      if (!series) return failure("series_not_found");
      if (await this.isTournamentCancelled({ db: client, tournamentId: series.tournamentId })) {
        return failure("tournament_cancelled");
      }
      if (CLOSED_SERIES_STATUSES.includes(series.status)) return ok(series);
      if (series.seriesDeadlineAt === null) return failure("no_deadline");
      if (now < series.seriesDeadlineAt) return failure("deadline_not_reached");

      const gameInProgress = series.games.some((game) => game.status === "playing");
      if (gameInProgress && now < series.seriesDeadlineAt + (input.liveGameGraceMs ?? 0)) {
        if (series.status !== "overtime")
          await client.query(
            "UPDATE match_series SET status='overtime', overtime_started_at=$1, version=version+1 WHERE id=$2",
            [now, series.id],
          );
        return ok(await this.reread(client, series.id));
      }

      const [wins0, wins1] = series.wins;
      const decided: DeadlineOutcome =
        wins0 !== wins1
          ? {
              status: "resolved",
              officialResult: wins0 > wins1 ? "participant0" : "participant1",
              reason: "deadline_ahead_on_games",
            }
          : tiedAtDeadline(input.policy);
      await this.voidOpenGames(client, series, now);
      await this.closeSeries(client, series.id, series.matchId, { ...decided, at: now, commandId: input.commandId });
      return ok(await this.reread(client, series.id));
    });
    await this.announceIfResolved(result);
    return result;
  }

  /**
   * Charges one game of the confrontation to a participant who is not there, by decision rather
   * than by play.
   *
   * This is the middle rung of the attendance ladder, and it is deliberately NOT expressed as a
   * fake room result: no room ever existed, no `MatchRecord` should claim one did, and
   * {@link recordGameResult} would need a `roomId` to lie about. What it writes instead is a
   * finished game with no room and an explicit reason, so the ledger says what happened.
   *
   * `commandId` is the deadline row that ordered the loss. The synthetic game's primary key is
   * derived from it, so a command executed twice — a lapsed lease, two instances overlapping
   * during a deploy — inserts the same row twice and adds one win, not two. That derivation is
   * the whole idempotency story here; without it, retrying a no-show penalty would silently
   * hand out the match.
   *
   * The series is created if the confrontation never started one, because a player who never
   * arrived never triggered presence. A live authorization for the game being lost is voided:
   * whoever holds it must not be able to walk into a room for a game already decided.
   */
  async recordAdministrativeGameLoss(
    input: AdministrativeCommand & { loserAccountId: string; commandId: string },
  ): Promise<SeriesResult<SeriesRecord>> {
    const now = input.now ?? Date.now();
    const result = await this.mutate<SeriesResult<SeriesRecord>>(input.matchId, async (client) => {
      const match = await lockMatch(client, input.matchId);
      if (!match || match.tournamentId !== input.tournamentId) return failure("match_not_found");
      if (await this.isTournamentCancelled({ db: client, tournamentId: match.tournamentId })) {
        return failure("tournament_cancelled");
      }
      const loserSeat = seatOf(match, { kind: "account", accountId: input.loserAccountId });
      if (loserSeat === undefined) return failure("not_a_participant");
      if (!presenceMatches(match, input)) return failure("presence_changed");

      const series = await this.ensureSeries(client, match, input.winsRequired, input.seriesDurationMs, now);
      if (CLOSED_SERIES_STATUSES.includes(series.status)) return ok(series);

      await this.voidOpenGames(client, series, now, input.reason);
      const winnerSeat = loserSeat === 0 ? 1 : 0;
      const gameId = derivedUuid(input.commandId, "administrative_game_loss");
      const inserted = await client.query(
        `INSERT INTO tournament_games (id, series_id, game_index, status, result, result_reason, allocated_at, finished_at)
         VALUES ($1,$2,$3,'finished',$4,$5,$6,$6) ON CONFLICT DO NOTHING`,
        [
          gameId,
          series.id,
          series.games.length + 1,
          winnerSeat === 0 ? "participant0" : "participant1",
          input.reason,
          now,
        ],
      );
      if (inserted.rowCount !== 1) return ok(await this.reread(client, series.id));

      const wins: [number, number] = [...series.wins];
      wins[winnerSeat] += 1;
      await client.query(`UPDATE match_series SET wins${winnerSeat}=$1, version=version+1 WHERE id=$2`, [
        wins[winnerSeat],
        series.id,
      ]);
      if (wins[winnerSeat] >= series.winsRequired)
        await this.closeSeries(client, series.id, series.matchId, {
          status: "resolved",
          officialResult: winnerSeat === 0 ? "participant0" : "participant1",
          reason: input.reason,
          at: now,
          commandId: input.commandId,
        });
      return ok(await this.reread(client, series.id));
    });
    await this.announceIfResolved(result);
    return result;
  }

  /**
   * Ends the whole confrontation by decision: a match loss for an absentee, a double no-show, or a
   * pause for an organizer when neither outcome is the server's to invent.
   *
   * Idempotent by the same rule as every other resolution path — a series already closed is
   * returned untouched, so the outcome recorded first is the one that stands.
   */
  async resolveSeriesAdministratively(
    input: AdministrativeCommand & {
      outcome: { status: SeriesStatus; officialResult: SeriesOfficialResult | null };
    },
  ): Promise<SeriesResult<SeriesRecord>> {
    const now = input.now ?? Date.now();
    const result = await this.mutate<SeriesResult<SeriesRecord>>(input.matchId, async (client) => {
      const match = await lockMatch(client, input.matchId);
      if (!match || match.tournamentId !== input.tournamentId) return failure("match_not_found");
      if (await this.isTournamentCancelled({ db: client, tournamentId: match.tournamentId })) {
        return failure("tournament_cancelled");
      }
      if (!presenceMatches(match, input)) return failure("presence_changed");

      const series = await this.ensureSeries(client, match, input.winsRequired, input.seriesDurationMs, now);
      if (CLOSED_SERIES_STATUSES.includes(series.status)) return ok(series);

      await this.voidOpenGames(client, series, now, input.reason);
      await this.closeSeries(client, series.id, series.matchId, {
        ...input.outcome,
        reason: input.reason,
        at: now,
        commandId: input.commandId,
      });
      return ok(await this.reread(client, series.id));
    });
    await this.announceIfResolved(result);
    return result;
  }

  /**
   * The judge's door, and the ONLY writer that may overrule a confrontation the server already
   * closed. Used exclusively by `src/tournaments/arbitration`.
   *
   * Every other resolution path treats {@link CLOSED_SERIES_STATUSES} as terminal and returns the
   * series untouched, which is correct for machines: a scheduler that retries a lapsed lease must
   * not re-decide anything. But it also made `needs_organizer_decision` a dead end — a series parked
   * for a judge could not be un-parked by anyone, so its round could never close. This is the way
   * out, and it is deliberately narrow:
   *
   *  - `mode: "decide"` settles a confrontation that is NOT yet decided — parked, still playing, or
   *    timed out — and refuses one already `resolved`. That is `decideSeries` and `concedeMatch`.
   *  - `mode: "correct"` replaces the official result of a series that IS `resolved`. That is
   *    `correctResult`, and its far harsher precondition — the round must still be open — is the
   *    caller's to enforce, because only the caller can see the round.
   *
   * The outcome is always terminal: this never re-opens play. That is what makes the attendance
   * ladder safe across an arbitration decision — {@link closeSeries} retires every deadline still
   * watching the match, so no rung can fire a penalty at a confrontation a judge already settled,
   * and no second ladder is ever needed (nor could one be inserted, since `UNIQUE (kind,
   * subject_id)` is per match for the life of the event).
   *
   * `audit` runs inside this transaction. An audit row that could outlive a rolled-back decision
   * would describe something that never happened, so the ledger write is not left to the caller.
   */
  async overrideResolution(input: {
    tournamentId: string;
    matchId: string;
    mode: "decide" | "correct";
    outcome: { officialResult: SeriesOfficialResult };
    reason: string;
    winsRequired: number;
    seriesDurationMs: number | null;
    commandId: string;
    now?: number;
    /**
     * The score the corrected result should carry. Only consulted in `correct` mode; see
     * {@link coherentWins} for what is written when the caller does not supply one.
     */
    correctedWins?: [number, number];
    audit?: (client: PoolClient, before: SeriesRecord, after: SeriesRecord) => Promise<void>;
  }): Promise<SeriesResult<SeriesRecord>> {
    const now = input.now ?? Date.now();
    const result = await this.mutate<SeriesResult<SeriesRecord>>(input.matchId, async (client) => {
      const match = await lockMatch(client, input.matchId);
      if (!match || match.tournamentId !== input.tournamentId) return failure("match_not_found");
      if (await this.isTournamentCancelled({ db: client, tournamentId: match.tournamentId })) {
        return failure("tournament_cancelled");
      }
      const before = await this.ensureSeries(client, match, input.winsRequired, input.seriesDurationMs, now);
      if (input.mode === "decide" && before.status === "resolved") return failure("series_already_resolved");
      if (input.mode === "correct" && before.status !== "resolved") return failure("series_not_found");

      // A correction that changed the winner but left the old score behind would leave the record
      // self-contradicting — "participant0 won" beside 0-2 — and the standings' own explanation of
      // itself would be a lie. `decide` writes no score, because an administratively settled
      // confrontation genuinely had no games: claiming wins nobody played for would be worse.
      if (input.mode === "correct") {
        const wins =
          input.correctedWins ?? coherentWins(before.wins, input.outcome.officialResult, before.winsRequired);
        if (wins[0] !== before.wins[0] || wins[1] !== before.wins[1])
          await client.query("UPDATE match_series SET wins0=$1, wins1=$2 WHERE id=$3", [wins[0], wins[1], before.id]);
      }

      await this.voidOpenGames(client, before, now, input.reason);
      await this.closeSeries(client, before.id, before.matchId, {
        status: "resolved",
        officialResult: input.outcome.officialResult,
        reason: input.reason,
        at: now,
        // No `commandId`: that field names a DEADLINE ROW to spare from retirement, and an
        // arbitration command is not one. A judge's decision retires every rung watching the
        // confrontation, with nothing held back.
      });
      const after = await this.reread(client, before.id);
      await input.audit?.(client, before, after);
      return ok(after);
    });
    // Announced like any other resolution, so the round close and the bracket advance the judge is
    // unblocking happen through the SAME path a played-out confrontation uses. A second announce for
    // a corrected series is harmless: every listener re-derives its state from the database.
    await this.announceIfResolved(result);
    return result;
  }

  async series(seriesId: string): Promise<SeriesRecord | undefined> {
    await this.accounts.ensureReady();
    return readSeries(this.accounts.pool, seriesId);
  }

  async seriesForMatch(matchId: string): Promise<SeriesRecord | undefined> {
    await this.accounts.ensureReady();
    return readSeriesByMatch(this.accounts.pool, matchId);
  }

  /** Presence and series state for one match, without asserting presence. */
  async presence(matchId: string): Promise<MatchPresence | undefined> {
    await this.accounts.ensureReady();
    const match = await readMatch(this.accounts.pool, matchId);
    if (!match) return undefined;
    return { ...match, series: await readSeriesByMatch(this.accounts.pool, matchId) };
  }

  /** Every match of a tournament as the wire shape the detail view renders. */
  async scoreViews(tournamentId: string): Promise<SeriesScoreView[]> {
    await this.accounts.ensureReady();
    const matches = (
      await this.accounts.pool.query<MatchRow>(
        `SELECT ${MATCH_COLUMNS} FROM tournament_matches WHERE tournament_id=$1 ORDER BY round, position`,
        [tournamentId],
      )
    ).rows.map(toMatch);
    return Promise.all(
      matches.map(async (match) => toScoreView(match, await readSeriesByMatch(this.accounts.pool, match.matchId))),
    );
  }

  /**
   * Starts the confrontation's clock, and — in the same transaction — queues the deadline that
   * will stop it.
   *
   * The enqueue lives here rather than in the caller because the two writes have to commit
   * together. A series row whose deadline was never queued is a confrontation that runs for ever
   * with nothing watching it, and a queued deadline for a series that rolled back is a command
   * pointed at nothing. Neither is recoverable after the fact, so neither is left to a caller to
   * remember. An untimed format queues nothing, because it has no instant to queue.
   */
  private async createSeries(
    client: PoolClient,
    match: MatchDetails,
    winsRequired: number,
    seriesDurationMs: number | null,
    now: number,
  ): Promise<SeriesRecord> {
    const id = randomUUID();
    const deadlineAt = seriesDurationMs === null ? null : now + seriesDurationMs;
    await client.query(
      `INSERT INTO match_series (id, tournament_match_id, wins_required, status, started_at, series_deadline_at)
       VALUES ($1,$2,$3,'playing',$4,$5)`,
      [id, match.matchId, winsRequired, now, deadlineAt],
    );
    if (deadlineAt !== null)
      await insertDeadline(client, {
        kind: "series_deadline",
        tournamentId: match.tournamentId,
        subjectId: id,
        dueAt: deadlineAt,
        now,
      });
    return (await readSeries(client, id))!;
  }

  /**
   * The confrontation's series, created if presence never started one.
   *
   * An administrative decision has to attach to a series row, because the series IS the record of
   * a confrontation's outcome. A double no-show has no presence to have created one, so this is
   * where it comes from; its clock starts at the moment of the decision, which is the only instant
   * the confrontation can be said to have begun at all.
   */
  private async ensureSeries(
    client: PoolClient,
    match: MatchDetails,
    winsRequired: number,
    seriesDurationMs: number | null,
    now: number,
  ): Promise<SeriesRecord> {
    return (
      (await readSeriesByMatch(client, match.matchId)) ??
      (await this.createSeries(client, match, winsRequired, seriesDurationMs, now))
    );
  }

  /**
   * The game an authorization may be issued for: the one still open, or a freshly allocated next
   * slot.
   *
   * The budget counts DECISIVE games only — the ones that produced a win. A best-of-N is settled by
   * at most `2N-1` of those, and once they are spent the score cannot change, so the deadline
   * resolves the series on the score as it stands.
   *
   * A drawn or voided game does not spend the budget, because it decided nothing: it is replayed.
   * Counting it would strand an untimed series — 1-1 with game 3 drawn has no clock to resolve it
   * and would sit in `playing` for ever with nothing left to authorize. `game_index` is therefore
   * the sequence number of games actually played, and exceeds 3 exactly when games were drawn or
   * voided. A timed series is bounded by its clock; an untimed one is bounded only by the players
   * eventually deciding a game, which is the same open-endedness a drawn match has always had.
   */
  private async nextGame(client: PoolClient, series: SeriesRecord, now: number): Promise<GameRecord | undefined> {
    const open = series.games.find((game) => OPEN_GAME_STATUSES.includes(game.status));
    if (open) return open;
    const decisive = series.games.filter(
      (game) => game.result === "participant0" || game.result === "participant1",
    ).length;
    const nextIndex = series.games.length + 1;
    if (decisive >= series.winsRequired * 2 - 1) return undefined;
    const id = randomUUID();
    await client.query(
      "INSERT INTO tournament_games (id, series_id, game_index, status, allocated_at) VALUES ($1,$2,$3,'allocated',$4)",
      [id, series.id, nextIndex, now],
    );
    return (await readGame(client, id))!;
  }

  /**
   * Closes every game still open, and voids the authorizations that could still open a room for
   * one.
   *
   * Voiding the game alone is not enough: an authorization already issued is a live right to enter
   * a room, and a decision taken away from the table has to reach it. Expiring the token is how —
   * validation already refuses anything whose expiry has passed, so there is no second rejection
   * path to keep in step with this one.
   */
  private async voidOpenGames(
    client: PoolClient,
    series: SeriesRecord,
    now: number,
    reason = "series_deadline",
  ): Promise<void> {
    for (const game of series.games) {
      if (!OPEN_GAME_STATUSES.includes(game.status)) continue;
      await client.query(
        "UPDATE tournament_games SET status='voided', result='voided', result_reason=$1, finished_at=$2 WHERE id=$3",
        [reason, now, game.id],
      );
      await client.query(
        "UPDATE tournament_game_authorizations SET expires_at=$1 WHERE game_id=$2 AND consumed_at IS NULL AND expires_at>$1",
        [now, game.id],
      );
    }
  }

  /**
   * Ends the confrontation, and retires the deadlines that were watching it.
   *
   * A decided confrontation has nothing left to wake up for: its shared clock cannot expire into
   * anything, and the attendance rung after it has nobody left to penalise. Retiring both in the
   * same transaction is what keeps the queue's log honest — every row that fires afterwards means
   * something, instead of a stream of no-ops nobody reads. Correctness never depended on it, since
   * every command re-checks, but a monitorable queue does.
   */
  private async closeSeries(
    client: PoolClient,
    seriesId: string,
    matchId: string,
    outcome: {
      status: SeriesStatus;
      officialResult: SeriesOfficialResult | null;
      reason: string;
      at: number;
      commandId?: string;
    },
  ): Promise<void> {
    await client.query(
      `UPDATE match_series
         SET status=$1, official_result=$2, resolution_reason=$3, resolved_at=$4, version=version+1
       WHERE id=$5`,
      [outcome.status, outcome.officialResult, outcome.reason, outcome.at, seriesId],
    );
    await retireDeadlines(client, [seriesId, matchId], outcome.at, "cancelled_series_closed", outcome.commandId);
    // `tournament_matches.status` is deliberately not touched. Deciding that a confrontation is
    // over is this module's business; moving the bracket on account of it is the manager's, and
    // the legacy column still carries the single-elimination vocabulary the old bracket advances
    // through. The series row is the authority on the confrontation's outcome.
  }

  private async isTournamentCancelled({ db, tournamentId }: TournamentStateParams): Promise<boolean> {
    const row = (await db.query<{ status: string }>("SELECT status FROM tournaments WHERE id=$1", [tournamentId]))
      .rows[0];
    return row?.status === "cancelled";
  }

  private async reread(client: PoolClient, seriesId: string): Promise<SeriesRecord> {
    return (await readSeries(client, seriesId))!;
  }

  private async seriesIdForGame(gameId: string): Promise<string | undefined> {
    await this.accounts.ensureReady();
    return (
      await this.accounts.pool.query<{ series_id: string }>("SELECT series_id FROM tournament_games WHERE id=$1", [
        gameId,
      ])
    ).rows[0]?.series_id;
  }

  /** One series' mutations, serialized in this process and in one database transaction. */
  private async mutate<T>(key: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const release = await this.acquireLock(key);
    try {
      await this.accounts.ensureReady();
      const client = await this.accounts.pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    } finally {
      release();
    }
  }
}

/**
 * The score a corrected result implies, when the organizer did not state one.
 *
 * The rule is: the new winner is credited exactly the wins the format requires, and the loser keeps
 * whatever they genuinely won, capped one short of the threshold so the score cannot read as if they
 * had taken the confrontation too. A collective outcome — a draw or a double loss — credits neither
 * side the threshold, so both are capped the same way.
 *
 * It is a derivation, not a reconstruction: nobody can know from here which games were misrecorded.
 * An organizer who does know passes `correctedWins` and this is not consulted.
 */
function coherentWins(
  wins: readonly [number, number],
  officialResult: SeriesOfficialResult,
  winsRequired: number,
): [number, number] {
  const capped = Math.max(0, winsRequired - 1);
  const kept: [number, number] = [Math.min(wins[0], capped), Math.min(wins[1], capped)];
  if (officialResult === "participant0") return [winsRequired, kept[1]];
  if (officialResult === "participant1") return [kept[0], winsRequired];
  return kept;
}

type DeadlineOutcome = { status: SeriesStatus; officialResult: SeriesOfficialResult | null; reason: string };

function tiedAtDeadline(policy: SeriesTimeoutPolicy): DeadlineOutcome {
  if (policy.kind === "elimination")
    return {
      status: "needs_organizer_decision",
      officialResult: null,
      reason: "elimination_tie_needs_state_tiebreak",
    };
  // `extra_turns_then_draw` differs from `draw` only in what happens BEFORE the clock is declared
  // spent — the extra turns are played in the room. By the time a series is resolved on its
  // deadline both spellings mean the same thing here.
  if (policy.onTie === "double_loss")
    return { status: "resolved", officialResult: "double_loss", reason: "deadline_tie_double_loss" };
  return { status: "resolved", officialResult: "draw", reason: "deadline_tie_draw" };
}

function gameResultOf(
  input: AuthoritativeGameResult,
  series: SeriesRecord,
): { result: GameResult; reason: string | null } | undefined {
  if (input.outcome.kind === "draw") return { result: "draw", reason: null };
  if (input.outcome.kind === "voided") return { result: "voided", reason: input.outcome.reason };
  const seat =
    input.outcome.kind === "winner"
      ? seatOfSeries(series, { kind: "account", accountId: input.outcome.winnerAccountId })
      : seatOfSeries(series, { kind: "bot", participantId: input.outcome.winnerParticipantId });
  if (seat === undefined) return undefined;
  return { result: seat === 0 ? "participant0" : "participant1", reason: null };
}

function toAuthorization(series: SeriesRecord, game: GameRecord, token: string, expiresAt: number): GameAuthorization {
  return {
    gameId: game.id,
    seriesId: series.id,
    matchId: series.matchId,
    tournamentId: series.tournamentId,
    gameIndex: game.gameIndex,
    participantAccountIds: series.participantAccountIds,
    participantIds: series.participantIds,
    token,
    expiresAt,
  };
}

function toScoreView(match: MatchDetails, series: SeriesRecord | undefined): SeriesScoreView {
  const currentGame = series?.games.find((game) => OPEN_GAME_STATUSES.includes(game.status));
  return {
    matchId: match.matchId,
    seriesId: series?.id ?? null,
    status: matchStatusOf(match, series),
    participantIds: series?.participantIds ?? match.participantIds,
    winnerSeat: series?.officialResult === "participant0" ? 0 : series?.officialResult === "participant1" ? 1 : null,
    participant0Id: match.participantAccountIds[0],
    participant1Id: match.participantAccountIds[1],
    wins0: series?.wins[0] ?? 0,
    wins1: series?.wins[1] ?? 0,
    currentGameIndex: currentGame?.gameIndex ?? null,
    joinDeadlineAt: match.joinDeadlineAt,
    seriesDeadlineAt: series?.seriesDeadlineAt ?? null,
    winnerParticipantId: winnerOf(match, series),
    pairingReason: match.pairingReason,
  };
}

function matchStatusOf(match: MatchDetails, series: SeriesRecord | undefined): MatchStatus {
  if (!series) return match.presentAt.some((at) => at !== null) ? "awaiting_players" : "scheduled";
  if (series.status === "overtime") return "overtime";
  return CLOSED_SERIES_STATUSES.includes(series.status) ? "resolved" : "playing";
}

function winnerOf(match: MatchDetails, series: SeriesRecord | undefined): string | null {
  if (series?.officialResult === "participant0") return match.participantAccountIds[0];
  if (series?.officialResult === "participant1") return match.participantAccountIds[1];
  return null;
}

/** Who an authorization admits, and what they may play. */
type SeatIdentity = {
  participantId: string | null;
  kind: ParticipantKind;
  displayName: string;
  deck: ParticipantDeckSnapshot;
};

/**
 * The competitive deck this account froze for this tournament, plus the name to seat it under. The
 * one and only deck they may play — a saved deck edited afterwards, or anything the client sends at
 * join time, is not it. The display name is the participant snapshot, so a rename cannot rewrite
 * the public identity of a tournament that has already started.
 */
async function humanIdentity(
  db: Queryable,
  tournamentId: string,
  accountId: string,
): Promise<SeatIdentity | undefined> {
  const row = (
    await db.query<{ id: string; display_name: string; deck_snapshot: ParticipantDeckSnapshot | string | null }>(
      "SELECT id, display_name, deck_snapshot FROM tournament_participants WHERE tournament_id=$1 AND account_id=$2 AND status='active'",
      [tournamentId, accountId],
    )
  ).rows[0];
  const deck = parseSnapshot(row?.deck_snapshot);
  if (!deck || !row?.display_name) return undefined;
  return { participantId: row.id, kind: "human", displayName: row.display_name, deck };
}

/**
 * The same, for a seat with no Account. The name and the deck both come from the participant row —
 * a bot's deck is copied into `deck_snapshot` at seating exactly like a human's, so everything
 * downstream of this point reads one column for every kind of participant.
 *
 * The row must still belong to this tournament and be `active`, so a participant id leaked from one
 * event cannot be redeemed in another.
 */
async function botIdentity(
  db: Queryable,
  tournamentId: string,
  participantId: string,
): Promise<SeatIdentity | undefined> {
  const row = (
    await db.query<{
      kind: ParticipantKind;
      display_name: string;
      deck_snapshot: ParticipantDeckSnapshot | string | null;
    }>(
      "SELECT kind, display_name, deck_snapshot FROM tournament_participants WHERE tournament_id=$1 AND id=$2 AND status='active'",
      [tournamentId, participantId],
    )
  ).rows[0];
  const deck = parseSnapshot(row?.deck_snapshot);
  if (!row || row.kind !== "bot" || !deck) return undefined;
  return { participantId, kind: "bot", displayName: row.display_name, deck };
}

function parseSnapshot(
  value: ParticipantDeckSnapshot | string | null | undefined,
): ParticipantDeckSnapshot | undefined {
  return (typeof value === "string" ? JSON.parse(value) : value) ?? undefined;
}

async function hasLiveAuthorization(
  client: PoolClient,
  gameId: string,
  holder: SeriesSeatHolder,
  now: number,
): Promise<boolean> {
  const column = holder.kind === "account" ? "account_id" : "participant_id";
  const id = holder.kind === "account" ? holder.accountId : holder.participantId;
  const found = await client.query(
    `SELECT 1 FROM tournament_game_authorizations WHERE game_id=$1 AND ${column}=$2 AND consumed_at IS NULL AND expires_at>$3`,
    [gameId, id, now],
  );
  return (found.rowCount ?? 0) > 0;
}

const MATCH_COLUMNS =
  "id, status, tournament_id, player0_account_id, player1_account_id, player0_participant_id, player1_participant_id, player0_present_at, player1_present_at, join_deadline_at, pairing_reason";
const SERIES_COLUMNS =
  "id, tournament_match_id, wins_required, wins0, wins1, status, started_at, series_deadline_at, official_result, resolution_reason, resolved_at, version";
const GAME_COLUMNS =
  "id, series_id, game_index, room_id, status, result, result_reason, allocated_at, claimed_at, finished_at, player0_deck_snapshot, player1_deck_snapshot";

type Queryable = Pick<PoolClient, "query">;
type TournamentStateParams = { db: Queryable; tournamentId: string };

type MatchRow = {
  id: string;
  status: string;
  tournament_id: string;
  player0_account_id: string | null;
  player1_account_id: string | null;
  player0_participant_id: string | null;
  player1_participant_id: string | null;
  player0_present_at: string | number | null;
  player1_present_at: string | number | null;
  join_deadline_at: string | number | null;
  pairing_reason: PairingReason | null;
};

type MatchDetails = {
  matchId: string;
  status: string;
  tournamentId: string;
  participantAccountIds: [string | null, string | null];
  participantIds: [string | null, string | null];
  presentAt: [number | null, number | null];
  joinDeadlineAt: number | null;
  pairingReason: PairingReason | null;
};

type SeriesRow = {
  id: string;
  tournament_match_id: string;
  wins_required: string | number;
  wins0: string | number;
  wins1: string | number;
  status: SeriesStatus;
  started_at: string | number;
  series_deadline_at: string | number | null;
  official_result: SeriesOfficialResult | null;
  resolution_reason: string | null;
  resolved_at: string | number | null;
  version: string | number;
};

type GameRow = {
  id: string;
  series_id: string;
  game_index: string | number;
  room_id: string | null;
  status: GameStatus;
  result: GameResult | null;
  result_reason: string | null;
  allocated_at: string | number;
  claimed_at: string | number | null;
  finished_at: string | number | null;
  player0_deck_snapshot: ParticipantDeckSnapshot | string | null;
  player1_deck_snapshot: ParticipantDeckSnapshot | string | null;
};

type AuthorizationRow = {
  token_hash: string;
  game_id: string;
  account_id: string | null;
  participant_id: string | null;
  expires_at: string | number;
  consumed_at: string | number | null;
  consumed_room_id: string | null;
};

async function readMatch(db: Queryable, matchId: string): Promise<MatchDetails | undefined> {
  const row = (await db.query<MatchRow>(`SELECT ${MATCH_COLUMNS} FROM tournament_matches WHERE id=$1`, [matchId]))
    .rows[0];
  return row && toMatch(row);
}

async function lockMatch(client: PoolClient, matchId: string): Promise<MatchDetails | undefined> {
  const row = (
    await client.query<MatchRow>(`SELECT ${MATCH_COLUMNS} FROM tournament_matches WHERE id=$1 FOR UPDATE`, [matchId])
  ).rows[0];
  return row && toMatch(row);
}

async function readSeries(db: Queryable, seriesId: string): Promise<SeriesRecord | undefined> {
  const row = (await db.query<SeriesRow>(`SELECT ${SERIES_COLUMNS} FROM match_series WHERE id=$1`, [seriesId])).rows[0];
  return row && hydrate(db, row);
}

async function lockSeries(client: PoolClient, seriesId: string): Promise<SeriesRecord | undefined> {
  const row = (
    await client.query<SeriesRow>(`SELECT ${SERIES_COLUMNS} FROM match_series WHERE id=$1 FOR UPDATE`, [seriesId])
  ).rows[0];
  return row && hydrate(client, row);
}

async function readSeriesByMatch(db: Queryable, matchId: string): Promise<SeriesRecord | undefined> {
  const row = (
    await db.query<SeriesRow>(`SELECT ${SERIES_COLUMNS} FROM match_series WHERE tournament_match_id=$1`, [matchId])
  ).rows[0];
  return row && hydrate(db, row);
}

async function readGame(db: Queryable, gameId: string): Promise<GameRecord | undefined> {
  const row = (await db.query<GameRow>(`SELECT ${GAME_COLUMNS} FROM tournament_games WHERE id=$1`, [gameId])).rows[0];
  return row && toGame(row);
}

async function lockGame(client: PoolClient, gameId: string): Promise<GameRecord | undefined> {
  const row = (
    await client.query<GameRow>(`SELECT ${GAME_COLUMNS} FROM tournament_games WHERE id=$1 FOR UPDATE`, [gameId])
  ).rows[0];
  return row && toGame(row);
}

async function hydrate(db: Queryable, row: SeriesRow): Promise<SeriesRecord> {
  const match = await readMatch(db, row.tournament_match_id);
  const games = (
    await db.query<GameRow>(`SELECT ${GAME_COLUMNS} FROM tournament_games WHERE series_id=$1 ORDER BY game_index`, [
      row.id,
    ])
  ).rows.map(toGame);
  return {
    id: row.id,
    matchId: row.tournament_match_id,
    tournamentId: match?.tournamentId ?? "",
    participantAccountIds: match?.participantAccountIds ?? [null, null],
    participantIds: match?.participantIds ?? [null, null],
    winsRequired: Number(row.wins_required),
    wins: [Number(row.wins0), Number(row.wins1)],
    status: row.status,
    startedAt: Number(row.started_at),
    seriesDeadlineAt: row.series_deadline_at === null ? null : Number(row.series_deadline_at),
    officialResult: row.official_result,
    resolutionReason: row.resolution_reason,
    resolvedAt: row.resolved_at === null ? null : Number(row.resolved_at),
    version: Number(row.version),
    games,
  };
}

function toMatch(row: MatchRow): MatchDetails {
  return {
    matchId: row.id,
    status: row.status,
    tournamentId: row.tournament_id,
    participantAccountIds: [row.player0_account_id, row.player1_account_id],
    participantIds: [row.player0_participant_id, row.player1_participant_id],
    presentAt: [nullableNumber(row.player0_present_at), nullableNumber(row.player1_present_at)],
    joinDeadlineAt: nullableNumber(row.join_deadline_at),
    pairingReason: row.pairing_reason,
  };
}

function toGame(row: GameRow): GameRecord {
  return {
    id: row.id,
    seriesId: row.series_id,
    gameIndex: Number(row.game_index),
    roomId: row.room_id,
    status: row.status,
    result: row.result,
    resultReason: row.result_reason,
    allocatedAt: Number(row.allocated_at),
    claimedAt: nullableNumber(row.claimed_at),
    finishedAt: nullableNumber(row.finished_at),
    deckSnapshots: [parseSnapshot(row.player0_deck_snapshot) ?? null, parseSnapshot(row.player1_deck_snapshot) ?? null],
  };
}

function seatOf(match: MatchDetails, holder: SeriesSeatHolder): 0 | 1 | undefined {
  return seatIn(holder.kind === "account" ? match.participantAccountIds : match.participantIds, holder);
}

function seatOfSeries(series: SeriesRecord, holder: SeriesSeatHolder): 0 | 1 | undefined {
  return seatIn(holder.kind === "account" ? series.participantAccountIds : series.participantIds, holder);
}

function seatIn(seats: readonly (string | null)[], holder: SeriesSeatHolder): 0 | 1 | undefined {
  const id = holder.kind === "account" ? holder.accountId : holder.participantId;
  if (seats[0] === id) return 0;
  if (seats[1] === id) return 1;
  return undefined;
}

/**
 * Whether presence under lock is still the presence the caller decided on. No expectation means
 * no claim was made about it, which is how a judge's correction reaches a table regardless of who
 * is sitting at it.
 */
function presenceMatches(match: MatchDetails, command: AdministrativeCommand): boolean {
  if (!command.expectedAbsentSeats) return true;
  const absent = absentSeats(match.presentAt, command.alwaysPresentSeats ?? []);
  const expected = [...command.expectedAbsentSeats].sort();
  return absent.length === expected.length && absent.every((seat, index) => seat === expected[index]);
}

/** The seats nobody is sitting at: not marked present, and not present by definition. */
export function absentSeats(
  presentAt: readonly (number | null)[],
  alwaysPresentSeats: readonly (0 | 1)[] = [],
): (0 | 1)[] {
  return ([0, 1] as const).filter((seat) => presentAt[seat] === null && !alwaysPresentSeats.includes(seat));
}

function nullableNumber(value: string | number | null): number | null {
  return value === null ? null : Number(value);
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function ok<T>(value: T): SeriesResult<T> {
  return { ok: true, value };
}

function failure<T>(reason: SeriesFailure): SeriesResult<T> {
  return { ok: false, reason };
}
