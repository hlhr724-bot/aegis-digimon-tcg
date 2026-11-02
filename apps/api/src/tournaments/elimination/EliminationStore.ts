import type { TournamentRules } from "@aegis/shared/tournaments/index";
import { TournamentRoundStartMode } from "@aegis/shared/tournaments/TournamentRoundStartMode";
import { grantTournamentTrophies } from "#api/achievements/grantTournamentTrophies";
import { randomUUID } from "node:crypto";
import type { LedgerEntry, MatchOutcome, ParticipantKind, PhaseKind } from "@aegis/shared";
import type { PoolClient } from "pg";
import type { AccountStore } from "../../accounts/AccountStore.js";
import { appendTournamentEvent } from "../audit/index.js";
import { type AcquireTournamentLock, inProcessTournamentLock } from "../participants/index.js";
import type { SeriesRecord } from "../series/index.js";
import { MATCH_OUTCOMES } from "../swiss/index.js";
import {
  advancementSlot,
  type BracketEntrant,
  bracketSize,
  bracketSlots,
  derivedBracketSeed,
  firstRoundPairings,
  roundCount,
  seedEntrants,
} from "./bracket.js";

/** The smallest field that can run at all. Below this the event is cancelled, never bot-filled. */
export const MINIMUM_ELIMINATION_FIELD = 2;

/** The phase kind {@link EliminationStore.createBracket} creates for a whole-event bracket. */
export const ELIMINATION_PHASE_KIND = "single_elimination";

/**
 * Every phase kind this module owns. A bracket is a bracket whether it IS the event or is the Top
 * Cut of a Swiss one: the same slots, the same advancement, the same champion handling. Scoping the
 * reads to both kinds is what lets one implementation serve both, and it stays unambiguous because
 * a tournament holds at most one of them — a Swiss event has `swiss` + `top_cut`, a bracket event
 * has `single_elimination` alone.
 */
export const BRACKET_PHASE_KINDS: readonly PhaseKind[] = [ELIMINATION_PHASE_KIND, "top_cut"];

type RoundStartParams = { client: PoolClient; tournamentId: string; now: number };

export type EliminationFailure =
  | "tournament_not_found"
  | "not_single_elimination"
  | "field_too_small"
  | "already_started";

export type EliminationResult<T> = { ok: true; value: T } | { ok: false; reason: EliminationFailure };

export type EliminationSeat = {
  participantId: string | null;
  accountId: string | null;
  kind: ParticipantKind | null;
  displayName: string | null;
};

export type EliminationMatch = {
  id: string;
  round: number;
  position: number;
  status: "waiting" | "pending" | "finished" | "bye";
  seats: [EliminationSeat, EliminationSeat];
  winnerParticipantId: string | null;
};

export type BracketView = {
  tournamentId: string;
  phaseId: string;
  bracketSeed: string;
  size: number;
  rounds: number;
  matches: EliminationMatch[];
  championParticipantId: string | null;
};

/**
 * A bracket phase and where its rounds sit in the tournament's round numbering.
 *
 * `roundOffset` is 0 for a bracket that IS the event, and the Swiss phase's last round number for a
 * Top Cut that follows one. See migration 009 for why the numbering continues rather than restarts.
 */
type PhaseRef = { id: string; roundOffset: number };

type ParticipantRow = {
  id: string;
  account_id: string | null;
  kind: ParticipantKind;
  display_name: string;
  seed: number | null;
};

type MatchRow = {
  id: string;
  round: number | string;
  position: number | string;
  status: EliminationMatch["status"];
  player0_account_id: string | null;
  player1_account_id: string | null;
  player0_participant_id: string | null;
  player1_participant_id: string | null;
  winner_participant_id: string | null;
};

/**
 * The single-elimination bracket for a program tournament.
 *
 * Two things separate it from the legacy bracket in `AccountStore`, and both are load-bearing:
 *
 *  - **A seat is a PARTICIPANT, not an Account.** That is what lets a bot occupy one. The account
 *    columns are still written for human seats, because presence, room tickets and the
 *    participant-facing views all read them, so a human seat carries both identities and a bot seat
 *    only the participant one.
 *  - **Every row belongs to a PHASE.** `tournament_matches` is shared with the Swiss program, which
 *    writes its own pairings into the same table. Scoping every read and every write by a phase of
 *    kind `single_elimination` is what stops this module from ever seeing — let alone overwriting —
 *    a published Swiss pairing. `resolveMatch` re-checks the phase kind of the match it was handed
 *    rather than trusting the caller, because the caller is a resolution listener that is told about
 *    EVERY confrontation in the system, Swiss ones included.
 *
 * Two invariants the module exists to protect:
 *
 *  - **A published pairing is never rewritten.** Creating a bracket that already exists returns the
 *    existing one; resolving a match that is already finished changes nothing. Every write restates
 *    the status it expected to find, so a retry cannot advance a winner twice.
 *  - **The draw is reproducible.** The seed is persisted and everything derived from it is pure
 *    (see `bracket.ts`), so re-reading after a restart yields the bracket that was published.
 *
 * Standings project from `tournament_result_ledger`, the same table the Swiss program writes, so an
 * elimination event has standings for the same reason a Swiss one does. The pure {@link ledger}
 * projection is a convenience for reading a bracket back; the TABLE is the source of truth.
 *
 * Shares the AccountStore's pool and migration run rather than opening a second one.
 */
export class EliminationStore {
  constructor(
    private readonly accounts: AccountStore,
    private readonly acquireLock: AcquireTournamentLock = inProcessTournamentLock(),
  ) {}

  /**
   * Draws and publishes the bracket for a tournament whose field is closed.
   *
   * Idempotent: a tournament that already has an elimination phase gets its existing bracket back
   * untouched, so a retry after a partial failure — or a second caller racing the first — cannot
   * redraw a published round.
   *
   * Byes are resolved in the same transaction that publishes the bracket. A bye is not a match
   * anybody plays, so leaving it open would strand round 2 waiting on a confrontation that has no
   * second seat.
   */
  async createBracket(input: { tournamentId: string; now?: number }): Promise<EliminationResult<BracketView>> {
    const now = input.now ?? Date.now();
    return this.mutate(input.tournamentId, async (client) => {
      const tournament = (
        await client.query<{ id: string; structure: string; status: string; bracket_seed: string | null }>(
          "SELECT id, structure, status, bracket_seed FROM tournaments WHERE id=$1 FOR UPDATE",
          [input.tournamentId],
        )
      ).rows[0];
      if (!tournament) return { ok: false, reason: "tournament_not_found" } as const;
      if (tournament.structure !== "single_elimination")
        return { ok: false, reason: "not_single_elimination" } as const;
      if (tournament.status === "cancelled") return { ok: false, reason: "tournament_not_found" } as const;

      const existing = await this.phaseOf(client, input.tournamentId);
      if (existing) return { ok: true, value: await this.view(client, input.tournamentId, existing) } as const;

      const participants = await this.activeParticipants(client, input.tournamentId);
      const size = bracketSize(participants.length);
      if (size === 0) return { ok: false, reason: "field_too_small" } as const;

      const bracketSeed = tournament.bracket_seed ?? derivedBracketSeed(input.tournamentId);
      if (!tournament.bracket_seed)
        await client.query("UPDATE tournaments SET bracket_seed=$1 WHERE id=$2", [bracketSeed, input.tournamentId]);

      const phase = await this.createPhase(client, input.tournamentId, roundCount(size), now);
      const entrants = seedEntrants(
        participants.map((row) => ({ id: row.id, accountId: row.account_id, seed: row.seed })),
        bracketSeed,
      );
      await this.insertSlots(client, input.tournamentId, phase, size);
      await this.seatFirstRound(client, input.tournamentId, phase, entrants, size, now);
      await client.query("UPDATE tournaments SET status='in_progress' WHERE id=$1", [input.tournamentId]);
      await this.countEntries(client, participants);
      await this.resolveByes(client, input.tournamentId, phase, size, now);
      return { ok: true, value: await this.view(client, input.tournamentId, phase) } as const;
    });
  }

  /**
   * Publishes a bracket for a field whose seeding is already PERSISTED, inside a transaction the
   * caller owns.
   *
   * This is the Top Cut's entry point. Three things make it different from {@link createBracket},
   * and each is something the cut has to control:
   *
   *  - **The field is named, not derived.** A cut is the first N of a frozen standings order, not
   *    "everybody still active", so the caller passes the participant ids it admitted.
   *  - **The seeds are READ FROM THE ROW, not passed in.** `tournament_participants.top_cut_seed`
   *    is written by the same transaction moments earlier, and this reads it back. That is
   *    deliberate: a seed the bracket never reads is a stored value that could drift from the draw
   *    with nothing to notice, and the column exists precisely so the draw is explainable from the
   *    database alone. Reading it makes the persisted value load-bearing.
   *  - **The caller's transaction and lock.** The freeze, the seeds and the bracket are one atomic
   *    act; splitting them would leave a snapshot with no bracket, or a bracket drawn from seeds a
   *    concurrent write had already changed. The caller holds the tournament lock, so this must not
   *    take it again.
   *
   * `tournaments_played` is deliberately NOT counted here: the participants were counted when they
   * entered the event, and a Top Cut is a second phase of that event, not a second entry.
   */
  async publishSeededBracket(input: {
    client: PoolClient;
    tournamentId: string;
    kind: PhaseKind;
    participantIds: readonly string[];
    now: number;
  }): Promise<BracketView> {
    const { client, tournamentId, now } = input;
    const existing = await this.phaseOf(client, tournamentId);
    if (existing) return this.view(client, tournamentId, existing);

    const entrants = await this.seededEntrants(client, tournamentId, input.participantIds);
    const size = bracketSize(entrants.length);
    const phase = await this.createPhase(client, tournamentId, roundCount(size), now, input.kind);
    await this.insertSlots(client, tournamentId, phase, size);
    await this.seatFirstRound(client, tournamentId, phase, entrants, size, now);
    await this.resolveByes(client, tournamentId, phase, size, now);
    return this.view(client, tournamentId, phase);
  }

  /**
   * Advances the bracket for a confrontation the series module has just closed.
   *
   * This is the production trigger, registered in `tournaments/runtime.ts` as a resolution
   * listener, so nothing that plays a game — least of all `AegisRoom` — ever advances a bracket
   * itself. The listener is told about every confrontation in the system; a match that belongs to
   * another phase, or to no phase, is left alone.
   */
  async onSeriesResolvedById(seriesId: string): Promise<void> {
    await this.accounts.ensureReady();
    const row = (
      await this.accounts.pool.query<{
        tournament_match_id: string;
        official_result: string | null;
        resolution_reason: string | null;
      }>("SELECT tournament_match_id, official_result, resolution_reason FROM match_series WHERE id=$1", [seriesId])
    ).rows[0];
    if (!row) return;
    await this.applyResolution(row.tournament_match_id, seriesId, row.official_result, row.resolution_reason);
  }

  /** The same, for a caller that already holds the record. */
  async onSeriesResolved(series: SeriesRecord): Promise<void> {
    await this.applyResolution(series.matchId, series.id, series.officialResult, series.resolutionReason);
  }

  private async applyResolution(
    matchId: string,
    seriesId: string,
    officialResult: string | null,
    reason: string | null,
  ): Promise<void> {
    // Anything the bracket cannot act on — a draw, a double loss, a series parked for an organizer
    // — leaves the match exactly where it is. An elimination confrontation with no winner is a
    // judge's problem, not something to guess at.
    const seat = officialResult === "participant0" ? 0 : officialResult === "participant1" ? 1 : undefined;
    if (seat === undefined) return;
    await this.resolveMatch({ matchId, winnerSeat: seat, seriesId, reason: reason ?? "series_resolved" });
  }

  /**
   * Records one confrontation's winner and moves them on.
   *
   * Idempotent by restating the status it expects: a match already `finished` is left alone and no
   * second advancement happens, which is what makes a retried notification safe.
   *
   * Refuses outright for a match that is not part of an elimination phase. That guard is not
   * defensive decoration: the resolution listener fires for Swiss confrontations too, and this
   * method's next act is to write a winner and seat somebody into the following round.
   */
  async resolveMatch(input: {
    matchId: string;
    winnerSeat: 0 | 1;
    seriesId?: string;
    reason: string;
    now?: number;
  }): Promise<void> {
    const now = input.now ?? Date.now();
    const tournamentId = await this.tournamentOf(input.matchId);
    if (!tournamentId) return;
    await this.mutate(tournamentId, async (client) => {
      const tournament = (
        await client.query<{ status: string }>("SELECT status FROM tournaments WHERE id=$1 FOR UPDATE", [tournamentId])
      ).rows[0];
      if (!tournament || tournament.status === "cancelled" || tournament.status === "finished") {
        return;
      }
      const match = (
        await client.query<MatchRow & { tournament_id: string; phase_id: string | null }>(
          `SELECT ${MATCH_COLUMNS}, tournament_id, phase_id FROM tournament_matches WHERE id=$1 FOR UPDATE`,
          [input.matchId],
        )
      ).rows[0];
      if (!match || match.status === "finished") return;
      const phase = await this.phaseOf(client, match.tournament_id);
      if (!phase || match.phase_id !== phase.id) return;

      // With the participant index, so a bot seat carries the NAME it plays under: that name is the
      // only thing a person's match history can show for an opponent who has no account.
      const seats = seatsOf(match, await this.participantIndex(client, match.tournament_id));
      const winner = seats[input.winnerSeat];
      if (!winner.participantId) return;

      const updated = await client.query(
        "UPDATE tournament_matches SET status='finished', winner_participant_id=$1, winner_account_id=$2 WHERE id=$3 AND status<>'finished'",
        [winner.participantId, winner.accountId, input.matchId],
      );
      if (updated.rowCount !== 1) return;
      await this.recordOutcome(client, match.tournament_id, seats, input.winnerSeat, {
        roundNumber: Number(match.round),
        seriesId: input.seriesId ?? input.matchId,
        reason: input.reason,
        now,
      });
      const size = await this.sizeOf(client, phase.id);
      await this.advance(
        client,
        match.tournament_id,
        phase,
        Number(match.round),
        Number(match.position),
        size,
        winner,
        now,
      );
    });
  }

  async sweepAutomaticRounds(now = Date.now()): Promise<number> {
    await this.accounts.ensureReady();
    const candidates = (
      await this.accounts.pool.query<{ tournament_id: string }>(
        "SELECT DISTINCT m.tournament_id FROM tournament_matches m JOIN tournaments t ON t.id=m.tournament_id WHERE t.status='in_progress' AND t.round_start_mode=$1 AND m.status='waiting' AND m.player0_participant_id IS NOT NULL AND m.player1_participant_id IS NOT NULL",
        [TournamentRoundStartMode.AUTOMATIC.value],
      )
    ).rows;
    let started = 0;
    for (const candidate of candidates) {
      if (await this.startNextRound(candidate.tournament_id, now, true)) {
        started += 1;
      }
    }
    return started;
  }

  async startNextRound(tournamentId: string, now = Date.now(), automatic = false): Promise<boolean> {
    return this.mutate(tournamentId, async (client) => {
      const tournament = (
        await client.query<{
          status: string;
          round_start_mode: TournamentRoundStartMode;
          rules_snapshot: TournamentRules | string | null;
        }>("SELECT status, round_start_mode, rules_snapshot FROM tournaments WHERE id=$1 FOR UPDATE", [tournamentId])
      ).rows[0];
      if (
        tournament?.status !== "in_progress" ||
        (automatic && tournament.round_start_mode === TournamentRoundStartMode.MANUAL.value)
      ) {
        return false;
      }
      const matches = (
        await client.query<{
          id: string;
          round: number;
          status: string;
          player0_participant_id: string | null;
          player1_participant_id: string | null;
        }>(
          "SELECT id, round, status, player0_participant_id, player1_participant_id FROM tournament_matches WHERE tournament_id=$1 ORDER BY round,position",
          [tournamentId],
        )
      ).rows;
      if (matches.some((match) => match.status === "pending")) {
        return false;
      }
      const ready = matches.find(
        (match) => match.status === "waiting" && match.player0_participant_id && match.player1_participant_id,
      );
      if (!ready || matches.some((match) => Number(match.round) < Number(ready.round) && match.status === "waiting")) {
        return false;
      }
      const { joinDeadlineAt } = await this.getRoundStart({ client, tournamentId, now });
      await client.query(
        "UPDATE tournament_matches SET status='pending', join_deadline_at=$3 WHERE tournament_id=$1 AND round=$2 AND status='waiting' AND player0_participant_id IS NOT NULL AND player1_participant_id IS NOT NULL",
        [tournamentId, ready.round, joinDeadlineAt],
      );
      await appendTournamentEvent(client, {
        tournamentId,
        actorKind: "system",
        actorId: "system",
        command: "round_published",
        commandId: `bracket_round:${tournamentId}:${ready.round}`,
        reason: `round ${ready.round} was released`,
        reasonCode: "round_published",
        subjectKind: "tournament",
        subjectId: tournamentId,
        after: { roundNumber: ready.round },
        now,
      });
      return true;
    });
  }

  async bracket(tournamentId: string): Promise<BracketView | undefined> {
    await this.accounts.ensureReady();
    return this.bracketOn(this.accounts.pool, tournamentId);
  }

  /** The same read, inside a transaction the caller owns — so it can see its own uncommitted writes. */
  async bracketOn(db: Queryable, tournamentId: string): Promise<BracketView | undefined> {
    const phase = await this.phaseOf(db, tournamentId);
    if (!phase) return undefined;
    return this.view(db, tournamentId, phase);
  }

  /**
   * The bracket as ledger entries, derived from the match rows.
   *
   * A convenience projection for reading a bracket back, NOT the source of truth: what standings
   * project from is `tournament_result_ledger`, written by {@link resolveMatch}, exactly as the
   * Swiss program writes it. Keeping the derivation available is still worth it — it is how a test
   * or an operator checks that the table says what the bracket says.
   */
  async ledger(tournamentId: string): Promise<LedgerEntry[]> {
    await this.accounts.ensureReady();
    const phase = await this.phaseOf(this.accounts.pool, tournamentId);
    if (!phase) return [];
    const matches = await this.readMatches(this.accounts.pool, tournamentId, phase);
    const entries: LedgerEntry[] = [];
    for (const match of matches) {
      if (match.status === "bye") {
        const solo = match.seats.find((seat) => seat.participantId);
        if (solo?.participantId)
          entries.push({
            participantId: solo.participantId,
            opponentId: null,
            opponentKind: null,
            roundNumber: match.round,
            outcome: "bye",
          });
        continue;
      }
      if (match.status !== "finished" || !match.winnerParticipantId) continue;
      for (const [index, seat] of match.seats.entries()) {
        const opponent = match.seats[index === 0 ? 1 : 0]!;
        if (!seat.participantId) continue;
        entries.push({
          participantId: seat.participantId,
          opponentId: opponent.participantId,
          opponentKind: opponent.kind,
          roundNumber: match.round,
          outcome: seat.participantId === match.winnerParticipantId ? "win" : "loss",
        });
      }
    }
    return entries;
  }

  // --- internals ------------------------------------------------------------

  /**
   * The bracket phase of this tournament, if it has one, with the round numbering it occupies.
   *
   * Every read and write in this module goes through here. A tournament can hold several phases —
   * a Swiss phase and its Top Cut — and matches of all of them live in one table, so "this
   * tournament's matches" is never a safe question to ask. "This phase's matches" is.
   */
  private async phaseOf(db: Queryable, tournamentId: string): Promise<PhaseRef | undefined> {
    const row = (
      await db.query<{ id: string; round_offset: string | number | null }>(
        `SELECT id, round_offset FROM tournament_phases WHERE tournament_id=$1 AND kind IN (${BRACKET_PHASE_KINDS.map((kind) => `'${kind}'`).join(",")}) ORDER BY phase_order LIMIT 1`,
        [tournamentId],
      )
    ).rows[0];
    return row && { id: row.id, roundOffset: row.round_offset === null ? 0 : Number(row.round_offset) };
  }

  private async createPhase(
    client: PoolClient,
    tournamentId: string,
    rounds: number,
    now: number,
    kind: PhaseKind = ELIMINATION_PHASE_KIND,
  ): Promise<PhaseRef> {
    // Appended after whatever phases already exist, so a bracket added to an event that ran another
    // format first — a Top Cut — takes the next slot rather than colliding with the first.
    const previous = (
      await client.query<{ next_order: string | null; last_round: string | null }>(
        `SELECT MAX(p.phase_order) next_order, MAX(m.round) last_round
         FROM tournament_phases p LEFT JOIN tournament_matches m ON m.phase_id = p.id
         WHERE p.tournament_id=$1`,
        [tournamentId],
      )
    ).rows[0];
    const id = randomUUID();
    // The round numbering CONTINUES the event's, because `tournament_matches` and the result ledger
    // are both keyed by `(tournament, round, …)`: a second phase restarting at round 1 would
    // collide with the first on the match key and, worse, have its results silently swallowed by
    // the ledger's idempotency key. See migration 009.
    const roundOffset =
      previous?.last_round === null || previous?.last_round === undefined ? 0 : Number(previous.last_round);
    await client.query(
      `INSERT INTO tournament_phases (id, tournament_id, kind, phase_order, status, planned_rounds, round_offset, created_at)
       VALUES ($1,$2,$3,$4,'running',$5,$6,$7)`,
      [
        id,
        tournamentId,
        kind,
        previous?.next_order === null || previous?.next_order === undefined ? 0 : Number(previous.next_order) + 1,
        rounds,
        roundOffset,
        now,
      ],
    );
    return { id, roundOffset };
  }

  private async getRoundStart({
    client,
    tournamentId,
    now,
  }: RoundStartParams): Promise<{ mode: TournamentRoundStartMode; joinDeadlineAt: number | null }> {
    const row = (
      await client.query<{
        round_start_mode: TournamentRoundStartMode;
        rules_snapshot: TournamentRules | string | null;
      }>("SELECT round_start_mode, rules_snapshot FROM tournaments WHERE id=$1", [tournamentId])
    ).rows[0];
    const rules =
      typeof row?.rules_snapshot === "string"
        ? (JSON.parse(row.rules_snapshot) as TournamentRules)
        : row?.rules_snapshot;
    return {
      mode: row?.round_start_mode ?? TournamentRoundStartMode.AUTOMATIC.value,
      joinDeadlineAt: rules ? now + rules.attendance.joinGraceMs : null,
    };
  }

  private async insertSlots(client: PoolClient, tournamentId: string, phase: PhaseRef, size: number): Promise<void> {
    for (const slot of bracketSlots(size))
      await client.query(
        "INSERT INTO tournament_matches (id, tournament_id, phase_id, round, position, status) VALUES ($1,$2,$3,$4,$5,'waiting')",
        [randomUUID(), tournamentId, phase.id, slot.round + phase.roundOffset, slot.position],
      );
  }

  private async seatFirstRound(
    client: PoolClient,
    tournamentId: string,
    phase: PhaseRef,
    entrants: readonly BracketEntrant[],
    size: number,
    now: number,
  ): Promise<void> {
    const start = await this.getRoundStart({ client, tournamentId, now });
    const readyStatus = start.mode === TournamentRoundStartMode.MANUAL.value ? "waiting" : "pending";
    for (const pairing of firstRoundPairings(entrants, size)) {
      const both = pairing.entrant0 && pairing.entrant1;
      await client.query(
        `UPDATE tournament_matches
           SET player0_participant_id=$1, player0_account_id=$2, player1_participant_id=$3, player1_account_id=$4, status=$5, join_deadline_at=$10
         WHERE tournament_id=$6 AND phase_id=$7 AND round=$9 AND position=$8`,
        [
          pairing.entrant0?.participantId ?? null,
          pairing.entrant0?.accountId ?? null,
          pairing.entrant1?.participantId ?? null,
          pairing.entrant1?.accountId ?? null,
          both ? readyStatus : "bye",
          tournamentId,
          phase.id,
          pairing.position,
          phase.roundOffset + 1,
          both && readyStatus === "pending" ? start.joinDeadlineAt : null,
        ],
      );
    }
  }

  private async resolveByes(
    client: PoolClient,
    tournamentId: string,
    phase: PhaseRef,
    size: number,
    now: number,
  ): Promise<void> {
    const byes = (await this.readMatches(client, tournamentId, phase)).filter((match) => match.status === "bye");
    for (const match of byes) {
      const seatIndex = match.seats[0].participantId ? 0 : 1;
      const winner = match.seats[seatIndex];
      if (!winner.participantId) continue;
      await client.query("UPDATE tournament_matches SET winner_participant_id=$1, winner_account_id=$2 WHERE id=$3", [
        winner.participantId,
        winner.accountId,
        match.id,
      ]);
      await this.appendLedger(client, tournamentId, now, {
        participantId: winner.participantId,
        opponentId: null,
        opponentKind: null,
        roundNumber: match.round,
        outcome: "bye",
      });
      await this.advance(client, tournamentId, phase, match.round, match.position, size, winner, now);
    }
  }

  /**
   * Carries a winner into the next slot, or ends the tournament when there is none.
   *
   * The champion update is guarded on the tournament not already being finished, so a retried
   * advancement cannot award `tournaments_won` twice.
   */
  private async advance(
    client: PoolClient,
    tournamentId: string,
    phase: PhaseRef,
    round: number,
    position: number,
    size: number,
    winner: EliminationSeat,
    now: number,
  ): Promise<void> {
    // The bracket's arithmetic is phase-local (round 1 is the first round of THIS bracket); the
    // stored round is tournament-wide. The offset is applied at this boundary and nowhere else.
    const next = advancementSlot(round - phase.roundOffset, position, size);
    if (!next) {
      const finished = await client.query(
        "UPDATE tournaments SET status='finished', winner_account_id=$1 WHERE id=$2 AND status<>'finished'",
        [winner.accountId, tournamentId],
      );
      await client.query("UPDATE tournament_phases SET status='finished' WHERE id=$1", [phase.id]);
      // Only on the transition. The update is guarded on the tournament not already being finished,
      // so a retried advancement writes neither a second statistic nor a second event.
      if (finished.rowCount === 1) {
        await appendTournamentEvent(client, {
          tournamentId,
          actorKind: "system",
          actorId: "system",
          command: "tournament_finished",
          commandId: `tournament_finished:${tournamentId}`,
          reason: "the final was won",
          reasonCode: "bracket_completed",
          subjectKind: "tournament",
          subjectId: tournamentId,
          phaseId: phase.id,
          participantId: winner.participantId,
          after: { winnerParticipantId: winner.participantId, winnerAccountId: winner.accountId },
        });
        await grantTournamentTrophies({
          db: client,
          tournamentId,
          standings: async () => [],
          now: Date.now(),
        });
      }
      // A bot champion updates no player statistic: there is no account to credit, and inventing
      // one would put a non-person in the standings.
      if (finished.rowCount === 1 && winner.accountId)
        await client.query(
          "INSERT INTO player_stats (account_id, tournaments_won) VALUES ($1,1) ON CONFLICT (account_id) DO UPDATE SET tournaments_won=player_stats.tournaments_won+1",
          [winner.accountId],
        );
      return;
    }
    await client.query(
      `UPDATE tournament_matches
         SET player${next.seat}_participant_id=$1, player${next.seat}_account_id=$2
       WHERE tournament_id=$3 AND phase_id=$4 AND round=$5 AND position=$6 AND player${next.seat}_participant_id IS NULL`,
      [winner.participantId, winner.accountId, tournamentId, phase.id, next.round + phase.roundOffset, next.position],
    );
    const start = await this.getRoundStart({ client, tournamentId, now });
    if (start.mode === TournamentRoundStartMode.AUTOMATIC.value) {
      await client.query(
        `UPDATE tournament_matches SET status='pending', join_deadline_at=$5
         WHERE tournament_id=$1 AND phase_id=$2 AND round=$3 AND position=$4 AND status='waiting'
           AND player0_participant_id IS NOT NULL AND player1_participant_id IS NOT NULL`,
        [tournamentId, phase.id, next.round + phase.roundOffset, next.position, start.joinDeadlineAt],
      );
    }
    // Which seat a winner was carried into. Without it a replay can see who won each confrontation
    // but not how the bracket was assembled from those wins, which is most of what a bracket IS.
    await appendTournamentEvent(client, {
      tournamentId,
      actorKind: "system",
      actorId: "system",
      command: "bracket_advanced",
      commandId: `bracket_advanced:${phase.id}:${round}:${position}`,
      reason: `the winner of round ${round} match ${position} advanced`,
      reasonCode: "bracket_advanced",
      subjectKind: "participant",
      subjectId: winner.participantId,
      phaseId: phase.id,
      participantId: winner.participantId,
      after: {
        fromRound: round,
        fromPosition: position,
        toRound: next.round,
        toPosition: next.position,
        seat: next.seat,
      },
    });
  }

  /**
   * Writes what a resolved confrontation means: two ledger rows, and — where a person was involved
   * — one match record.
   *
   * The ledger is what standings read, and it uses the same outcome mapping and the same
   * round-unique idempotency key as the Swiss program, so an elimination event and a Swiss event
   * produce standings by exactly one code path.
   *
   * The match record is keyed by the SERIES rather than by a room: a best-of-three is one
   * competitive result, and one row per game would count it three times. A bot-involved
   * confrontation is recorded with the human in seat 0, an empty seat 1 and `opponentKind: "bot"`;
   * `recordMatch` deliberately leaves `player_stats` alone for those, so a bot result is visible in
   * a player's history and absent from their competitive counters. A bot-versus-bot confrontation
   * records nothing at all — there is no person whose history it belongs in.
   */
  private async recordOutcome(
    client: PoolClient,
    tournamentId: string,
    seats: [EliminationSeat, EliminationSeat],
    winnerSeat: 0 | 1,
    context: { roundNumber: number; seriesId: string; reason: string; now: number },
  ): Promise<void> {
    const [outcome0, outcome1] = MATCH_OUTCOMES[winnerSeat === 0 ? "participant0" : "participant1"];
    for (const [index, outcome] of [outcome0, outcome1].entries()) {
      const seat = seats[index]!;
      const opponent = seats[index === 0 ? 1 : 0]!;
      if (!seat.participantId) continue;
      await this.appendLedger(client, tournamentId, context.now, {
        participantId: seat.participantId,
        opponentId: opponent.participantId,
        opponentKind: opponent.kind,
        roundNumber: context.roundNumber,
        outcome,
      });
    }

    const humans = seats.filter((seat) => seat.accountId);
    if (humans.length === 0) return;
    const roomId = `series:${context.seriesId}`;
    if (humans.length === 2) {
      await this.accounts.recordMatch(
        {
          roomId,
          mode: "tournament",
          playerAccountIds: [seats[0].accountId!, seats[1].accountId!],
          outcome: winnerSeat === 0 ? "player0" : "player1",
          reason: context.reason,
          opponentKind: "human",
        },
        client,
      );
      return;
    }
    // One person, one bot. The person is always seat 0 of the RECORD, whichever seat of the match
    // they held, so `player1_account_id IS NULL` reads as "the opponent was a bot" everywhere.
    const humanSeat = seats[0].accountId ? 0 : 1;
    const bot = seats[humanSeat === 0 ? 1 : 0]!;
    await this.accounts.recordMatch(
      {
        roomId,
        mode: "tournament",
        playerAccountIds: [seats[humanSeat]!.accountId!, null],
        outcome: winnerSeat === humanSeat ? "player0" : "player1",
        reason: context.reason,
        opponentKind: "bot",
        opponentDisplayName: bot.displayName,
      },
      client,
    );
  }

  /**
   * Appends one ledger row, or does nothing if this participant already has one for this round.
   * The `ON CONFLICT DO NOTHING` on the round-uniqueness index is what makes every command here
   * safe to retry: a result counted in exactly one place cannot be counted twice.
   */
  private async appendLedger(
    client: PoolClient,
    tournamentId: string,
    now: number,
    entry: LedgerEntry & { outcome: MatchOutcome },
  ): Promise<void> {
    await client.query(
      `INSERT INTO tournament_result_ledger
         (id, tournament_id, participant_id, opponent_id, opponent_kind, round_number, outcome, recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (tournament_id, participant_id, round_number) DO NOTHING`,
      [
        randomUUID(),
        tournamentId,
        entry.participantId,
        entry.opponentId,
        entry.opponentKind,
        entry.roundNumber,
        entry.outcome,
        now,
      ],
    );
  }

  private async countEntries(client: PoolClient, participants: readonly ParticipantRow[]): Promise<void> {
    for (const participant of participants) {
      if (!participant.account_id) continue;
      await client.query(
        "INSERT INTO player_stats (account_id, tournaments_played) VALUES ($1,1) ON CONFLICT (account_id) DO UPDATE SET tournaments_played=player_stats.tournaments_played+1",
        [participant.account_id],
      );
    }
  }

  /**
   * The named participants, ordered by the cut seed stored on their row.
   *
   * Throws rather than guessing when a named participant carries no seed: a bracket seeded from a
   * partially written field would silently draw the wrong cut, and the caller wrote those seeds in
   * this very transaction, so a missing one means the write above it did not happen.
   */
  private async seededEntrants(
    client: PoolClient,
    tournamentId: string,
    participantIds: readonly string[],
  ): Promise<BracketEntrant[]> {
    const rows = (
      await client.query<{ id: string; account_id: string | null; top_cut_seed: string | number | null }>(
        "SELECT id, account_id, top_cut_seed FROM tournament_participants WHERE tournament_id=$1 AND top_cut_seed IS NOT NULL ORDER BY top_cut_seed",
        [tournamentId],
      )
    ).rows;
    const named = new Set(participantIds);
    const entrants = rows
      .filter((row) => named.has(row.id))
      .map((row) => ({ participantId: row.id, accountId: row.account_id, seed: Number(row.top_cut_seed) }));
    if (entrants.length !== named.size)
      throw new Error(
        `top cut of ${tournamentId} named ${named.size} participants but only ${entrants.length} carry a top_cut_seed`,
      );
    return entrants;
  }

  private async activeParticipants(client: PoolClient, tournamentId: string): Promise<ParticipantRow[]> {
    return (
      await client.query<ParticipantRow>(
        "SELECT id, account_id, kind, display_name, seed FROM tournament_participants WHERE tournament_id=$1 AND status='active' ORDER BY created_at, id",
        [tournamentId],
      )
    ).rows;
  }

  /**
   * This phase's matches. `round` is the STORED, tournament-wide number, which is the phase's own
   * round plus its offset — the number the ledger and the match key use. Only the bracket
   * arithmetic works phase-locally, and it subtracts the offset where it does.
   */
  private async readMatches(db: Queryable, tournamentId: string, phase: PhaseRef): Promise<EliminationMatch[]> {
    const rows = (
      await db.query<MatchRow>(
        `SELECT ${MATCH_COLUMNS} FROM tournament_matches WHERE tournament_id=$1 AND phase_id=$2 ORDER BY round, position`,
        [tournamentId, phase.id],
      )
    ).rows;
    const names = await this.participantIndex(db, tournamentId);
    return rows.map((row) => ({
      id: row.id,
      round: Number(row.round),
      position: Number(row.position),
      status: row.status,
      seats: seatsOf(row, names),
      winnerParticipantId: row.winner_participant_id,
    }));
  }

  private async participantIndex(
    db: Queryable,
    tournamentId: string,
  ): Promise<Map<string, { kind: ParticipantKind; displayName: string }>> {
    const rows = (
      await db.query<{ id: string; kind: ParticipantKind; display_name: string }>(
        "SELECT id, kind, display_name FROM tournament_participants WHERE tournament_id=$1",
        [tournamentId],
      )
    ).rows;
    return new Map(rows.map((row) => [row.id, { kind: row.kind, displayName: row.display_name }]));
  }

  private async view(db: Queryable, tournamentId: string, phase: PhaseRef): Promise<BracketView> {
    const matches = await this.readMatches(db, tournamentId, phase);
    const size = matches.length === 0 ? 0 : Math.max(...matches.map((match) => match.position + 1)) * 2;
    const final = matches.find((match) => match.round === roundCount(size) + phase.roundOffset);
    const seed =
      (
        await db.query<{ bracket_seed: string | null }>("SELECT bracket_seed FROM tournaments WHERE id=$1", [
          tournamentId,
        ])
      ).rows[0]?.bracket_seed ?? "";
    return {
      tournamentId,
      phaseId: phase.id,
      bracketSeed: seed,
      size,
      rounds: roundCount(size),
      matches,
      championParticipantId: final?.status === "finished" ? final.winnerParticipantId : null,
    };
  }

  private async sizeOf(client: PoolClient, phaseId: string): Promise<number> {
    const row = (
      await client.query<{ count: string }>("SELECT COUNT(*) count FROM tournament_matches WHERE phase_id=$1", [
        phaseId,
      ])
    ).rows[0];
    // A bracket of `size` slots has `size - 1` matches in total.
    return Number(row?.count ?? 0) + 1;
  }

  private async tournamentOf(matchId: string): Promise<string | undefined> {
    await this.accounts.ensureReady();
    return (
      await this.accounts.pool.query<{ tournament_id: string }>(
        "SELECT tournament_id FROM tournament_matches WHERE id=$1",
        [matchId],
      )
    ).rows[0]?.tournament_id;
  }

  private async mutate<T>(tournamentId: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const release = await this.acquireLock(tournamentId);
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

type Queryable = Pick<PoolClient, "query">;

const MATCH_COLUMNS =
  "id, round, position, status, player0_account_id, player1_account_id, player0_participant_id, player1_participant_id, winner_participant_id";

function seatsOf(
  row: MatchRow,
  names?: Map<string, { kind: ParticipantKind; displayName: string }>,
): [EliminationSeat, EliminationSeat] {
  const seat = (participantId: string | null, accountId: string | null): EliminationSeat => {
    const meta = participantId ? names?.get(participantId) : undefined;
    return {
      participantId,
      accountId,
      kind: meta?.kind ?? (participantId && accountId ? "human" : participantId ? "bot" : null),
      displayName: meta?.displayName ?? null,
    };
  };
  return [
    seat(row.player0_participant_id, row.player0_account_id),
    seat(row.player1_participant_id, row.player1_account_id),
  ];
}
