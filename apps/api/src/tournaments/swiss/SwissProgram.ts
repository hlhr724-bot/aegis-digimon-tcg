import { TournamentRoundStartMode } from "@aegis/shared/tournaments/TournamentRoundStartMode";
import { grantTournamentTrophies } from "#api/achievements/grantTournamentTrophies";
import { buildTournamentRules } from "#api/tournaments/rules/buildTournamentRules";
import { randomUUID } from "node:crypto";
import type {
  LedgerEntry,
  MatchOutcome,
  ParticipantKind,
  PhaseView,
  RoundView,
  SeriesScoreView,
  StandingsRow,
  TournamentRules,
} from "@aegis/shared";
import type { PoolClient } from "pg";
import type { AccountStore } from "../../accounts/AccountStore.js";
import type { Queryable } from "../../db/migrator.js";
import { appendTournamentEvent } from "../audit/index.js";
import { pairSwissRound, type PairingParticipant, type SwissPairingResult } from "../pairing/index.js";
import { type AcquireTournamentLock, inProcessTournamentLock } from "../participants/index.js";
import { freezeStructure } from "../rules/index.js";
import type { SeriesStore } from "../series/index.js";
import { computeStandings } from "../standings/index.js";

export type SwissFailure =
  | "tournament_not_found"
  | "not_swiss"
  | "no_active_participants"
  | "participant_without_account"
  | "pairing_failed"
  | "round_not_found"
  | "round_not_ready"
  | "round_has_open_matches"
  | "round_already_published"
  | "match_needs_organizer_decision";

export type SwissResult<T> = { ok: true; value: T } | { ok: false; reason: SwissFailure; detail?: string };

/** What closing a round did, so a caller can log or assert on the transition without re-reading. */
export type RoundCloseOutcome =
  | { kind: "not_complete" }
  | { kind: "already_closed" }
  | { kind: "awaiting_manual_start" }
  | { kind: "next_round_published"; roundNumber: number }
  | { kind: "phase_frozen_for_top_cut"; topCutSize: number }
  | { kind: "tournament_finished"; winnerParticipantId: string | null };

/**
 * The Swiss lifecycle: freeze the structure, publish rounds, write the ledger, project standings,
 * and decide what happens when the last planned round closes.
 *
 * Two rules shape everything here.
 *
 * **Standings are always a projection of `tournament_result_ledger`, never a counter.** Nothing in
 * this module increments a stored score. A PLAYED match becomes ledger rows in one sweep at round
 * close; a bye is ledgered at publication instead, because a bye is decided the moment it is
 * awarded and nobody has to turn up for it. Both are keyed `(tournament, participant, round)`, so
 * the sweep is safe to run any number of times, and standings are recomputed from the whole ledger
 * on every read.
 *
 * **A round is published atomically or not at all.** The round row, every match of it, and every
 * match's `join_deadline_at` are written in one transaction — and {@link SwissProgram.mutate} rolls
 * that transaction back on a returned failure as well as a thrown one, so a refusal leaves the
 * database exactly as it found it and the retry sees the same world the first attempt did.
 *
 * Every command is idempotent, because the same commands are called from the result path, from
 * {@link SwissProgram.sweepOpenTournaments}, and from an organizer's manual nudge; none may
 * double-apply anything.
 *
 * **Known limit: `needs_organizer_decision` is a dead end until the arbitration slice lands.** A
 * confrontation that timed out tied in elimination, or whose series voided, has no result this
 * module may invent, so its round can never close. The sweep skips such rounds silently rather than
 * retrying them into an error log every tick; clearing them needs the judge commands slice 8 adds.
 */
export class SwissProgram {
  constructor(
    private readonly accounts: AccountStore,
    private readonly series: SeriesStore,
    private readonly acquireLock: AcquireTournamentLock = inProcessTournamentLock(),
  ) {}

  /**
   * Starts a Swiss event: freezes the round count and Top Cut size from the confirmed field,
   * creates the Swiss phase and publishes round 1 — all in one transaction.
   *
   * Called after {@link ParticipantStore.closeCheckIn} has frozen the decks, because the confirmed
   * field is exactly the participants that call left `active`. Calling it again once a phase exists
   * returns that phase untouched: the freeze happened once and a late drop must never resize it.
   */
  async startTournamentProgram(tournamentId: string, now: number = Date.now()): Promise<SwissResult<PhaseView>> {
    return this.mutate(tournamentId, async (client) => {
      const tournament = await lockTournament(client, tournamentId);
      if (!tournament) return failure("tournament_not_found");
      if (tournament.structure !== "swiss") return failure("not_swiss");

      const existing = await readPhase(client, tournamentId);
      if (existing) return ok(await this.phaseView(client, tournament, existing));

      const roster = await readRoster(client, tournamentId);
      if (roster.length === 0) return failure("no_active_participants");
      // Swiss pairs participants but seats accounts: the match row, the presence check and the
      // game authorization are all account-keyed. A bot has no account and therefore no seat, and
      // no preset allows bots in Swiss — so this is a corrupted field, not a supported case.
      const accountless = roster.find((participant) => participant.accountId === null);
      if (accountless) return failure("participant_without_account", accountless.id);

      const frozen = freezeStructure(roster.length, {
        structure: "swiss",
        topCut: tournament.topCutEnabled,
      });
      await client.query("UPDATE tournaments SET top_cut_size=$1, status='in_progress' WHERE id=$2", [
        frozen.topCutSize,
        tournamentId,
      ]);

      const phaseId = randomUUID();
      await client.query(
        `INSERT INTO tournament_phases (id, tournament_id, kind, phase_order, status, planned_rounds, created_at)
         VALUES ($1,$2,'swiss',0,'running',$3,$4)`,
        [phaseId, tournamentId, frozen.swissRounds, now],
      );

      if (tournament.roundStartMode !== TournamentRoundStartMode.MANUAL.value) {
        const published = await this.publishRound(client, tournament, phaseId, 1, now);
        if (!published.ok) {
          return published;
        }
      }
      const phase = (await readPhase(client, tournamentId))!;
      return ok(await this.phaseView(client, tournament, phase));
    });
  }

  /**
   * Closes a round once every match of it has resolved, writes the round's ledger rows, and
   * publishes the next round — or freezes the phase for the Top Cut, or finishes the event.
   *
   * Refuses while any match is still open: a Swiss round is a barrier, and pairing the next round
   * from a partial ledger would seat people against opponents chosen from results that had not
   * happened. Nothing is written on that refusal, so an in-progress round publishes no result of a
   * match that is still being played. (The round's bye, if it has one, was ledgered at publication —
   * it is not a played match and hiding it would only make the standings wrong.)
   *
   * Idempotent in both directions: a round already closed reports `already_closed` and touches
   * nothing, and re-running the sweep over an already-ledgered round inserts nothing (the ledger's
   * `(tournament, participant, round)` uniqueness is the key). Both the series-resolution seam and a
   * future scheduler call this, and they will race.
   */
  async closeRoundIfComplete(roundId: string, now: number = Date.now()): Promise<SwissResult<RoundCloseOutcome>> {
    const context = await this.roundContext(roundId);
    if (!context) return failure("round_not_found");
    return this.mutate(context.tournamentId, async (client) => {
      const round = await lockRound(client, roundId);
      if (!round) return failure("round_not_found");
      if (round.status === "closed") return ok({ kind: "already_closed" } as const);
      const tournament = await lockTournament(client, context.tournamentId);
      if (!tournament) return failure("tournament_not_found");
      if (tournament.status !== "in_progress") {
        return failure("round_not_ready");
      }
      const phase = (await readPhaseById(client, round.phaseId))!;

      const results = await this.roundResults(client, tournament.id, roundId);
      if (results.some((result) => result.state === "needs_decision"))
        return failure("match_needs_organizer_decision", roundId);
      if (results.some((result) => result.state === "open")) return ok({ kind: "not_complete" } as const);

      for (const result of results) await this.ledgerMatch(client, tournament.id, round.number, result, now);
      await client.query("UPDATE tournament_rounds SET status='closed', closed_at=$1 WHERE id=$2", [now, roundId]);
      // The close is what turns confrontations into standings, so it is the boundary a replay needs:
      // everything before it counts towards this round, everything after towards the next.
      await appendTournamentEvent(client, {
        tournamentId: tournament.id,
        actorKind: "system",
        actorId: "system",
        command: "round_closed",
        commandId: `round_closed:${roundId}`,
        reason: `round ${round.number} closed on its last confrontation`,
        reasonCode: "round_closed",
        subjectKind: "round",
        subjectId: roundId,
        phaseId: phase.id,
        roundId,
        after: { roundNumber: round.number, ledgered: results.length },
        now,
      });

      const plannedRounds = phase.plannedRounds ?? round.number;
      if (round.number < plannedRounds) {
        if (tournament.roundStartMode === TournamentRoundStartMode.MANUAL.value) {
          return ok({ kind: "awaiting_manual_start" } as const);
        }
        const published = await this.publishRound(client, tournament, phase.id, round.number + 1, now);
        if (!published.ok) return published;
        return ok({ kind: "next_round_published", roundNumber: round.number + 1 } as const);
      }

      // The Swiss phase is over. A frozen Top Cut size is a handover, not an ending: the phase
      // parks in `frozen` and the tournament stays running, for the Top Cut slice to consume.
      if ((tournament.topCutSize ?? 0) > 0) {
        await client.query("UPDATE tournament_phases SET status='frozen' WHERE id=$1", [phase.id]);
        return ok({ kind: "phase_frozen_for_top_cut", topCutSize: tournament.topCutSize as number } as const);
      }

      await client.query("UPDATE tournament_phases SET status='finished' WHERE id=$1", [phase.id]);
      // The leader who is still IN the event. Dropped and disqualified players keep their standings
      // rows — their results are real and their opponents' tiebreakers depend on them — but a player
      // who walked out, or was thrown out, cannot be crowned by having walked out early enough.
      const standings = await this.standingsOn(client, tournament);
      const active = new Set((await readRoster(client, tournament.id)).map((participant) => participant.id));
      const winner = standings.find((row) => active.has(row.participantId)) ?? null;
      const winnerAccountId = winner ? await accountOf(client, winner.participantId) : null;
      await client.query("UPDATE tournaments SET status='finished', winner_account_id=$1 WHERE id=$2", [
        winnerAccountId,
        tournament.id,
      ]);
      // The terminal event. A replay that reaches this row knows the tournament ended and who won,
      // without having to recompute standings from the ledger it may not have.
      await appendTournamentEvent(client, {
        tournamentId: tournament.id,
        actorKind: "system",
        actorId: "system",
        command: "tournament_finished",
        commandId: `tournament_finished:${tournament.id}`,
        reason: "the last swiss round closed",
        reasonCode: "swiss_completed",
        subjectKind: "tournament",
        subjectId: tournament.id,
        phaseId: phase.id,
        participantId: winner?.participantId ?? null,
        after: { winnerParticipantId: winner?.participantId ?? null, winnerAccountId },
        now,
      });
      await grantTournamentTrophies({
        db: client,
        tournamentId: tournament.id,
        standings: async () => standings,
        now,
      });
      return ok({ kind: "tournament_finished", winnerParticipantId: winner?.participantId ?? null } as const);
    });
  }

  /**
   * The production trigger. Wired to {@link SeriesStore}'s resolution seam, so the round closes as
   * soon as its last confrontation does — and, because the close is idempotent and re-derives
   * completeness from the database, a missed notification costs latency rather than correctness:
   * the next resolution, or a scheduler sweep, closes the round instead.
   *
   * A match with no round belongs to the legacy bracket and is not this module's business.
   */
  async onSeriesResolved(matchId: string, now: number = Date.now()): Promise<SwissResult<RoundCloseOutcome>> {
    await this.accounts.ensureReady();
    const roundId = (
      await this.accounts.pool.query<{ round_id: string | null }>(
        "SELECT round_id FROM tournament_matches WHERE id=$1",
        [matchId],
      )
    ).rows[0]?.round_id;
    if (!roundId) return ok({ kind: "not_complete" } as const);
    return this.closeRoundIfComplete(roundId, now);
  }

  /**
   * Advances every Swiss event that is able to advance, and reports how many moved.
   *
   * This is the recovery path, and the reason the tournament cannot be stalled by a lost message.
   * The resolution listener is a latency optimisation running in one process's memory: a crash
   * between the series COMMIT and the announce, a swallowed listener error, or simply the last
   * result arriving during a deploy all leave a round complete but unclosed, and nothing else would
   * ever look at it again. This looks at it again.
   *
   * Two half-states are repaired, both by re-deriving the truth from the database rather than
   * trusting any in-memory state:
   *  - a published round whose matches have all resolved is closed (which publishes its successor);
   *  - a running phase with NO open round and rounds still to play has its next round published,
   *    which is where a publication that failed and rolled back leaves the event.
   *
   * Cheap enough to call on every worker tick: one indexed query finds the candidates, and a
   * tournament with nothing to do costs one `not_complete` and no writes. Rounds parked on
   * `needs_organizer_decision` are skipped silently — they cannot be advanced without a judge, and
   * logging that every tick would bury the failures that do matter.
   *
   * WIRING POINT: the deadline worker (slice 4, a parallel agent's file) should call this on each
   * tick alongside its own deadline processing. It is deliberately not wired here — this module
   * exports the capability and the worker owns the schedule.
   */
  async sweepOpenTournaments(now: number = Date.now()): Promise<number> {
    await this.accounts.ensureReady();
    const candidates = (
      await this.accounts.pool.query<{ tournament_id: string }>(
        "SELECT DISTINCT tournament_id FROM tournament_phases WHERE kind='swiss' AND status='running'",
      )
    ).rows.map((row) => row.tournament_id);
    let advanced = 0;
    for (const tournamentId of candidates) if (await this.sweepTournament(tournamentId, now)) advanced += 1;
    return advanced;
  }

  /** One tournament's share of {@link sweepOpenTournaments}. True when it actually moved. */
  async sweepTournament(tournamentId: string, now: number): Promise<boolean> {
    const phase = await readPhase(this.accounts.pool, tournamentId);
    if (!phase || phase.status !== "running") return false;
    const tournament = await readTournament(this.accounts.pool, tournamentId);
    if (!tournament || tournament.status === "cancelled" || tournament.status === "finished") {
      return false;
    }
    const rounds = await readRounds(this.accounts.pool, phase.id);
    const open = rounds.find((round) => round.status !== "closed");

    if (open) {
      const closed = await this.closeRoundIfComplete(open.id, now);
      if (closed.ok) return closed.value.kind !== "not_complete" && closed.value.kind !== "already_closed";
      // A round waiting on a judge is not a failure to report; every other reason is.
      if (closed.reason !== "match_needs_organizer_decision")
        console.error(`[SwissProgram] sweep could not close round ${open.id}: ${closed.reason} ${closed.detail ?? ""}`);
      return false;
    }

    // No open round at all. Either the event is done, or a publication failed and rolled back.
    const closedRounds = rounds.filter((round) => round.status === "closed").length;
    if (phase.plannedRounds === null || closedRounds >= phase.plannedRounds) return false;
    if (tournament.roundStartMode === TournamentRoundStartMode.MANUAL.value) {
      return false;
    }
    const republished = await this.republishNextRound(tournamentId, phase.id, closedRounds + 1, now);
    if (!republished.ok)
      console.error(
        `[SwissProgram] sweep could not publish round ${closedRounds + 1} of ${tournamentId}: ${republished.reason} ${republished.detail ?? ""}`,
      );
    return republished.ok;
  }

  /** Publishes a round the phase is missing, in its own transaction. */
  private async republishNextRound(
    tournamentId: string,
    phaseId: string,
    roundNumber: number,
    now: number,
    manual = false,
  ): Promise<SwissResult<number>> {
    return this.mutate(tournamentId, async (client) => {
      const tournament = await lockTournament(client, tournamentId);
      if (!tournament) return failure("tournament_not_found");
      if (
        tournament.status !== "in_progress" ||
        (!manual && tournament.roundStartMode === TournamentRoundStartMode.MANUAL.value)
      ) {
        return failure("round_not_ready");
      }
      const rounds = await readRounds(client, phaseId);
      if (rounds.some((round) => round.status !== "closed") || roundNumber !== rounds.length + 1) {
        return failure("round_not_ready");
      }
      // Re-checked under the lock: another worker may have published it since the scan.
      const existing = await client.query("SELECT 1 FROM tournament_rounds WHERE phase_id=$1 AND number=$2", [
        phaseId,
        roundNumber,
      ]);
      if ((existing.rowCount ?? 0) > 0) return failure("round_already_published", String(roundNumber));
      const published = await this.publishRound(client, tournament, phaseId, roundNumber, now);
      if (!published.ok) return published;
      return ok(roundNumber);
    });
  }

  async startNextRound(tournamentId: string, now = Date.now()): Promise<SwissResult<number>> {
    await this.accounts.ensureReady();
    const phase = await readPhase(this.accounts.pool, tournamentId);
    if (!phase || phase.status !== "running") {
      return failure("round_not_ready");
    }
    const rounds = await readRounds(this.accounts.pool, phase.id);
    const next = rounds.length + 1;
    if (next > (phase.plannedRounds ?? 0)) {
      return failure("round_not_ready");
    }
    return this.republishNextRound(tournamentId, phase.id, next, now, true);
  }

  /** Every phase of a tournament as the wire shape the detail view renders. */
  async phaseViews(tournamentId: string): Promise<PhaseView[]> {
    await this.accounts.ensureReady();
    const tournament = await readTournament(this.accounts.pool, tournamentId);
    if (!tournament) return [];
    const phases = await readPhases(this.accounts.pool, tournamentId);
    return Promise.all(phases.map((phase) => this.phaseView(this.accounts.pool, tournament, phase)));
  }

  /**
   * The SWISS standings: a projection of the Swiss phase's rounds and nothing else.
   *
   * Scoped on purpose. The ledger holds every phase's results, and a Top Cut writes its own rows as
   * it is played — under a round numbering that continues the Swiss one. An unscoped projection
   * would therefore let a quarterfinal win, or a bracket bye, move the Swiss standings the cut was
   * made from, mid-cut, on the detail endpoint. The Swiss phase's rounds are 1..`plannedRounds` (its
   * own `round_offset` is 0, being the first phase), so that is the window.
   *
   * An event with no Swiss phase — a plain bracket — has no window to apply and projects the whole
   * ledger, exactly as before.
   */
  async standings(tournamentId: string): Promise<StandingsRow[]> {
    await this.accounts.ensureReady();
    const tournament = await readTournament(this.accounts.pool, tournamentId);
    if (!tournament) return [];
    return this.standingsOn(this.accounts.pool, tournament);
  }

  /** Every ledger row of a tournament, oldest round first. Exposed for audit and tests. */
  async ledger(tournamentId: string): Promise<LedgerEntry[]> {
    await this.accounts.ensureReady();
    return readLedger(this.accounts.pool, tournamentId);
  }

  private async standingsOn(db: Queryable, tournament: TournamentContext): Promise<StandingsRow[]> {
    const phase = await readPhase(db, tournament.id);
    const [ledger, roster] = await Promise.all([
      readLedger(db, tournament.id, phase?.plannedRounds ?? null),
      readRoster(db, tournament.id),
    ]);
    return computeStandings({
      ledger,
      standings: standingsConfig(tournament.rules, tournament.id),
      participants: roster.map((participant) => ({ id: participant.id, seed: participant.seed })),
      drawSeed: tournament.id,
    });
  }

  /**
   * Pairs and persists one round: the round row, one match per pairing, the bye, and each match's
   * join deadline. Runs inside the caller's transaction — publication is atomic with whatever
   * decided to publish (the phase creation, or the previous round's close).
   *
   * The pairer's seed is the tournament id. Only round 1 consumes it, and the pairer salts it with
   * the round number itself, so the shuffle is reproducible per event and independent of the clock,
   * the insertion order of the roster, and the process that computed it. Later rounds are fully
   * determined by points, seed and id, so they need no entropy at all.
   */
  private async publishRound(
    client: PoolClient,
    tournament: TournamentContext,
    phaseId: string,
    roundNumber: number,
    now: number,
  ): Promise<SwissResult<SwissPairingResult>> {
    const roster = await readRoster(client, tournament.id);
    if (roster.length === 0) return failure("no_active_participants");
    const ledger = await readLedger(client, tournament.id);
    const paired = pairSwissRound({
      participants: pairingParticipants(roster, ledger, standingsConfig(tournament.rules, tournament.id)),
      roundNumber,
      seed: tournament.id,
    });
    if (!paired.ok) return failure("pairing_failed", paired.error.message);
    const result = paired.result;

    const roundId = randomUUID();
    await client.query(
      `INSERT INTO tournament_rounds
         (id, phase_id, number, status, published_at, score_difference, score_difference_optimal, budget_exhausted)
       VALUES ($1,$2,$3,'published',$4,$5,$6,$7)`,
      [
        roundId,
        phaseId,
        roundNumber,
        now,
        result.scoreDifference,
        result.scoreDifferenceOptimal,
        result.budgetExhausted,
      ],
    );

    const accountOfParticipant = new Map(roster.map((participant) => [participant.id, participant.accountId]));
    const joinDeadlineAt = now + joinGraceMs(tournament.rules);
    let position = 0;
    for (const pairing of result.pairings) {
      await client.query(
        `INSERT INTO tournament_matches
           (id, tournament_id, round, position, player0_account_id, player1_account_id, status,
            phase_id, round_id, pairing_reason, join_deadline_at)
         VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9,$10)`,
        [
          randomUUID(),
          tournament.id,
          roundNumber,
          position,
          accountOfParticipant.get(pairing.participant0Id) ?? null,
          accountOfParticipant.get(pairing.participant1Id) ?? null,
          phaseId,
          roundId,
          pairing.reason,
          joinDeadlineAt,
        ],
      );
      position += 1;
    }

    // A bye is a resolved match the instant it is published: nobody has to show up for it, so it
    // carries no join deadline and its ledger row is written now rather than at round close. That
    // is what lets the round close on the remaining matches alone.
    if (result.bye) {
      const byeAccountId = accountOfParticipant.get(result.bye.participantId) ?? null;
      await client.query(
        `INSERT INTO tournament_matches
           (id, tournament_id, round, position, player0_account_id, winner_account_id, status,
            phase_id, round_id, pairing_reason)
         VALUES ($1,$2,$3,$4,$5,$5,'bye',$6,$7,$8)`,
        [randomUUID(), tournament.id, roundNumber, position, byeAccountId, phaseId, roundId, result.bye.reason],
      );
      await this.appendLedger(client, tournament.id, roundNumber, now, {
        participantId: result.bye.participantId,
        opponentId: null,
        opponentKind: null,
        roundNumber,
        outcome: "bye",
      });
    }
    // In the caller's transaction, so the trail cannot claim a round that rolled back. The pairer's
    // own report travels with it: a disputed pairing is explained months later from this row rather
    // than by re-running a searcher whose budget constants may have moved since.
    await appendTournamentEvent(client, {
      tournamentId: tournament.id,
      actorKind: "system",
      actorId: "system",
      command: "round_published",
      commandId: `round_published:${roundId}`,
      reason: `round ${roundNumber} was paired and published`,
      reasonCode: "round_published",
      subjectKind: "round",
      subjectId: roundId,
      phaseId,
      roundId,
      after: {
        roundNumber,
        matches: result.pairings.length,
        bye: result.bye?.participantId ?? null,
        scoreDifference: result.scoreDifference,
        scoreDifferenceOptimal: result.scoreDifferenceOptimal,
        budgetExhausted: result.budgetExhausted,
      },
      now,
    });
    return ok(result);
  }

  /** Every match of a round, with the outcome its series settled on (or why it has not). */
  private async roundResults(client: PoolClient, tournamentId: string, roundId: string): Promise<MatchResult[]> {
    const matches = (
      await client.query<MatchOutcomeRow>(
        `SELECT m.id, m.status, m.player0_account_id, m.player1_account_id, s.status series_status, s.official_result
         FROM tournament_matches m
         LEFT JOIN match_series s ON s.tournament_match_id = m.id
         WHERE m.round_id=$1 ORDER BY m.position`,
        [roundId],
      )
    ).rows;
    return Promise.all(matches.map((row) => this.toMatchResult(client, tournamentId, row)));
  }

  private async toMatchResult(client: PoolClient, tournamentId: string, row: MatchOutcomeRow): Promise<MatchResult> {
    const participants = await Promise.all(
      [row.player0_account_id, row.player1_account_id].map((accountId) =>
        accountId === null ? Promise.resolve(undefined) : participantOf(client, tournamentId, accountId),
      ),
    );
    const base = { matchId: row.id, participants } as const;
    // A bye was already settled and ledgered at publication; re-deriving it here would only risk
    // disagreeing with what was written.
    if (row.status === "bye") return { ...base, state: "ledgered" };
    if (row.series_status === "needs_organizer_decision") return { ...base, state: "needs_decision" };
    if (row.series_status !== "resolved" || row.official_result === null) return { ...base, state: "open" };
    const officialResult = resolvedResultOf(row.official_result, row.id);
    // `voided` means the confrontation produced no result at all. Turning that into a draw or a
    // double loss would be inventing one, which is exactly what the rules plan forbids: it waits
    // for an audited organizer decision instead.
    if (officialResult === null) return { ...base, state: "needs_decision" };
    return { ...base, state: "resolved", officialResult };
  }

  private async ledgerMatch(
    client: PoolClient,
    tournamentId: string,
    roundNumber: number,
    result: MatchResult,
    now: number,
  ): Promise<void> {
    if (result.state !== "resolved") return;
    const [first, second] = result.participants;
    if (!first || !second) return;
    const [outcome0, outcome1] = MATCH_OUTCOMES[result.officialResult];
    await this.appendLedger(client, tournamentId, roundNumber, now, {
      participantId: first.id,
      opponentId: second.id,
      opponentKind: second.kind,
      roundNumber,
      outcome: outcome0,
    });
    await this.appendLedger(client, tournamentId, roundNumber, now, {
      participantId: second.id,
      opponentId: first.id,
      opponentKind: first.kind,
      roundNumber,
      outcome: outcome1,
    });
    const winnerAccountId =
      result.officialResult === "participant0"
        ? first.accountId
        : result.officialResult === "participant1"
          ? second.accountId
          : null;
    await client.query("UPDATE tournament_matches SET status='finished', winner_account_id=$1 WHERE id=$2", [
      winnerAccountId,
      result.matchId,
    ]);
  }

  /**
   * Appends one ledger row, or does nothing if this participant already has one for this round.
   * `ON CONFLICT DO NOTHING` on the round-uniqueness index is what makes every command in this
   * module safe to retry: the ledger is the only place a result is counted, so an insert that
   * cannot happen twice is a result that cannot be counted twice.
   */
  private async appendLedger(
    client: PoolClient,
    tournamentId: string,
    roundNumber: number,
    now: number,
    entry: LedgerEntry,
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
        roundNumber,
        entry.outcome,
        now,
      ],
    );
  }

  // TODO(top-cut slice): `series.scoreViews` re-reads and re-hydrates EVERY match of the tournament
  // once per phase, and hydrating a series costs a query per match plus one per game. With a single
  // Swiss phase that is one pass over a small field; with a Top Cut phase alongside it, it is two
  // passes over the same rows. Fold the score views into a single grouped read when that slice adds
  // the second phase.
  private async phaseView(db: Queryable, tournament: TournamentContext, phase: PhaseRecord): Promise<PhaseView> {
    const rounds = await readRounds(db, phase.id);
    const scoreViews = new Map((await this.series.scoreViews(tournament.id)).map((view) => [view.matchId, view]));
    const matchRows = (
      await db.query<{
        id: string;
        round_id: string | null;
        phase_id: string | null;
        round: string | number;
        status: string;
      }>(
        "SELECT id, round_id, phase_id, round, status FROM tournament_matches WHERE tournament_id=$1 ORDER BY round, position",
        [tournament.id],
      )
    ).rows;

    // A BRACKET phase has no `tournament_rounds` rows: its rounds are implied by the shape of the
    // draw, and the matches carry their round number directly. Grouping by that number is what lets
    // one `PhaseView` describe both formats, so the client renders a Top Cut with the component it
    // already renders Swiss rounds with instead of a second projection of the same data.
    if (rounds.length === 0) {
      const byNumber = new Map<number, { matches: SeriesScoreView[]; settled: boolean }>();
      for (const row of matchRows) {
        if (row.phase_id !== phase.id) continue;
        const view = scoreViews.get(row.id);
        if (!view) continue;
        // Reported phase-locally: a Top Cut that follows four Swiss rounds stores its rounds as
        // 5, 6, 7, but it is the SECOND phase's first, second and third round to anybody reading it.
        const number = Number(row.round) - phase.roundOffset;
        const bucket = byNumber.get(number) ?? { matches: [], settled: true };
        bucket.matches.push(view);
        // A bracket round is over when every confrontation in it is settled — played out, or a bye
        // nobody had to turn up for. Until then it is published, because a bracket publishes a round
        // the moment its seats are filled.
        bucket.settled &&= row.status === "finished" || row.status === "bye";
        byNumber.set(number, bucket);
      }
      return {
        id: phase.id,
        kind: phase.kind,
        status: phase.status,
        plannedRounds: phase.plannedRounds,
        rounds: [...byNumber.entries()]
          .sort(([left], [right]) => left - right)
          .map(([number, bucket]): RoundView => ({
            number,
            status: bucket.settled ? "closed" : "published",
            publishedAt: null,
            matches: bucket.matches,
          })),
      };
    }

    const byRound = new Map<string, SeriesScoreView[]>();
    for (const row of matchRows) {
      if (row.round_id === null) continue;
      const view = scoreViews.get(row.id);
      if (!view) continue;
      const bucket = byRound.get(row.round_id) ?? [];
      bucket.push(view);
      byRound.set(row.round_id, bucket);
    }
    return {
      id: phase.id,
      kind: phase.kind,
      status: phase.status,
      plannedRounds: phase.plannedRounds,
      rounds: rounds.map((round): RoundView => ({
        number: round.number,
        status: round.status,
        publishedAt: round.publishedAt,
        matches: byRound.get(round.id) ?? [],
      })),
    };
  }

  private async roundContext(roundId: string): Promise<{ tournamentId: string } | undefined> {
    await this.accounts.ensureReady();
    const row = (
      await this.accounts.pool.query<{ tournament_id: string }>(
        `SELECT p.tournament_id FROM tournament_rounds r
         JOIN tournament_phases p ON p.id = r.phase_id WHERE r.id=$1`,
        [roundId],
      )
    ).rows[0];
    return row && { tournamentId: row.tournament_id };
  }

  /**
   * One tournament's lifecycle mutations, serialized in this process and in one transaction.
   *
   * Rolls back on a returned failure, not only on a thrown one. Every command here reports its
   * refusals as `{ ok: false }` rather than by throwing, so committing those would persist exactly
   * the half-states the commands exist to prevent: a round closed and ledgered whose successor
   * failed to publish is unrecoverable, because the retry finds the round already closed and stops.
   * A failure must leave the database as it found it, so the retry sees the same world the first
   * attempt did.
   */
  private async mutate<T>(
    tournamentId: string,
    work: (client: PoolClient) => Promise<SwissResult<T>>,
  ): Promise<SwissResult<T>> {
    const release = await this.acquireLock(tournamentId);
    try {
      await this.accounts.ensureReady();
      const client = await this.accounts.pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work(client);
        await client.query(result.ok ? "COMMIT" : "ROLLBACK");
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

/** How a series' official result becomes one ledger outcome per seat. */
/**
 * What one resolved confrontation means for each seat. Exported because the elimination bracket
 * writes the same ledger from the same mapping: two formats producing standings by two subtly
 * different tables of outcomes would be a bug nobody could see.
 */
export const MATCH_OUTCOMES: Record<ResolvedResult, [MatchOutcome, MatchOutcome]> = {
  participant0: ["win", "loss"],
  participant1: ["loss", "win"],
  draw: ["draw", "draw"],
  double_loss: ["double_loss", "double_loss"],
};

type ResolvedResult = "participant0" | "participant1" | "draw" | "double_loss";

/**
 * The stored official result, narrowed by exhaustive check rather than asserted.
 *
 * `null` means the confrontation is settled but has no result to ledger (`voided`). An unrecognised
 * value throws: it can only mean the series module started producing an outcome this projection has
 * never been taught to score, and silently dropping it would quietly corrupt the standings of a live
 * event. Failing loudly at the round that contains it is the cheaper mistake.
 */
function resolvedResultOf(value: string, matchId: string): ResolvedResult | null {
  switch (value) {
    case "participant0":
    case "participant1":
    case "draw":
    case "double_loss":
      return value;
    case "voided":
      return null;
    default:
      throw new Error(`match ${matchId} carries unknown official result "${value}"; standings cannot score it`);
  }
}

type MatchParticipant = { id: string; kind: ParticipantKind; accountId: string | null };

type MatchResult = {
  matchId: string;
  participants: (MatchParticipant | undefined)[];
} & (
  | { state: "open" }
  | { state: "ledgered" }
  | { state: "needs_decision" }
  | { state: "resolved"; officialResult: ResolvedResult }
);

type MatchOutcomeRow = {
  id: string;
  status: string;
  player0_account_id: string | null;
  player1_account_id: string | null;
  series_status: string | null;
  official_result: string | null;
};

type TournamentContext = {
  id: string;
  status: string;
  roundStartMode: TournamentRoundStartMode;
  structure: string;
  topCutEnabled: boolean;
  topCutSize: number | null;
  rules: TournamentRules | null;
};

type PhaseRecord = {
  id: string;
  kind: PhaseView["kind"];
  status: PhaseView["status"];
  phaseOrder: number;
  plannedRounds: number | null;
  /** Where this phase's rounds start in the tournament's round numbering. See migration 009. */
  roundOffset: number;
};

type RoundRecord = {
  id: string;
  phaseId: string;
  number: number;
  status: RoundView["status"];
  publishedAt: number | null;
};

type RosterEntry = { id: string; kind: ParticipantKind; accountId: string | null; seed: number | null };

/**
 * The standings configuration a projection may actually consume.
 *
 * The presets now emit the projection's own vocabulary, so a tournament created today needs no
 * translation at all. This layer is HISTORY: presets `bandai_general/1.0.0` and
 * `aegis_lightning/1.0.0` emitted `match_points`/`own_match_win_rate`/`random_final_position`, and a
 * ruleset is FROZEN at creation — every event created under those versions carries that spelling in
 * its `rules_snapshot` for ever, and no edit to the presets module can reach it. Translating here,
 * where a stored snapshot meets the projection, is the only place that can be true for both.
 *
 * Criteria that translate to nothing are dropped rather than raised: an unknown tiebreaker must not
 * take a tournament's standings offline.
 */
const TIEBREAKER_ALIASES: Record<string, string> = {
  match_points: "points",
  own_match_win_rate: "match_win_rate",
  random_final_position: "judge_random_draw",
};

const KNOWN_TIEBREAKERS = new Set([
  "points",
  "match_win_rate",
  "opponent_match_win_rate",
  "opponent_opponent_match_win_rate",
  "head_to_head",
  "extra_match",
  "judge_random_draw",
]);

/**
 * Tiebreakers dropped as unknown are reported once per tournament. Degrading silently is the whole
 * risk of the `.filter` below — the standings still compute, just ordered by fewer criteria than the
 * organizer's ruleset promised — so the drop has to be visible somewhere. Once per tournament rather
 * than once per read, because standings are projected on every detail request.
 */
const reportedUnknownTiebreakers = new Set<string>();

export function standingsConfig(
  rules: TournamentRules | null,
  tournamentId = "unknown-tournament",
): TournamentRules["standings"] {
  const standings = rules?.standings ?? buildTournamentRules({ bestOf: 3 }).standings;
  const translated = standings.tiebreakers.map((tiebreaker) => TIEBREAKER_ALIASES[tiebreaker] ?? tiebreaker);
  const usable = translated.filter((tiebreaker) => KNOWN_TIEBREAKERS.has(tiebreaker));
  if (usable.length !== translated.length && !reportedUnknownTiebreakers.has(tournamentId)) {
    reportedUnknownTiebreakers.add(tournamentId);
    const dropped = translated.filter((tiebreaker) => !KNOWN_TIEBREAKERS.has(tiebreaker));
    console.error(
      `[SwissProgram] tournament ${tournamentId} has frozen tiebreakers the standings cannot resolve: ${dropped.join(", ")}`,
    );
  }
  return { ...standings, tiebreakers: usable };
}

function joinGraceMs(rules: TournamentRules | null): number {
  return rules?.attendance.joinGraceMs ?? buildTournamentRules({ bestOf: 3 }).attendance.joinGraceMs;
}

/**
 * The pairer's view of the field, derived entirely from the ledger: points from the same projection
 * standings use, opponents and byes from the raw rows. Nothing is read from a counter, so the
 * pairing of round N is a function of the results of rounds 1..N-1 and nothing else.
 */
function pairingParticipants(
  roster: readonly RosterEntry[],
  ledger: readonly LedgerEntry[],
  standings: TournamentRules["standings"],
): PairingParticipant[] {
  const points = new Map(
    computeStandings({
      ledger,
      standings,
      participants: roster.map((participant) => ({ id: participant.id, seed: participant.seed })),
    }).map((row) => [row.participantId, row.points]),
  );
  const opponents = new Map<string, string[]>();
  const byes = new Map<string, number>();
  for (const entry of ledger) {
    if (entry.outcome === "bye") {
      byes.set(entry.participantId, (byes.get(entry.participantId) ?? 0) + 1);
      continue;
    }
    if (entry.opponentId === null) continue;
    const met = opponents.get(entry.participantId) ?? [];
    met.push(entry.opponentId);
    opponents.set(entry.participantId, met);
  }
  return roster.map((participant) => ({
    id: participant.id,
    seed: participant.seed,
    points: points.get(participant.id) ?? 0,
    opponentIds: opponents.get(participant.id) ?? [],
    byeCount: byes.get(participant.id) ?? 0,
  }));
}

const TOURNAMENT_COLUMNS = "id, status, round_start_mode, structure, top_cut_enabled, top_cut_size, rules_snapshot";

async function readTournament(db: Queryable, id: string): Promise<TournamentContext | undefined> {
  const row = (await db.query<TournamentRow>(`SELECT ${TOURNAMENT_COLUMNS} FROM tournaments WHERE id=$1`, [id]))
    .rows[0];
  return row && toTournamentContext(row);
}

async function lockTournament(client: PoolClient, id: string): Promise<TournamentContext | undefined> {
  const row = (
    await client.query<TournamentRow>(`SELECT ${TOURNAMENT_COLUMNS} FROM tournaments WHERE id=$1 FOR UPDATE`, [id])
  ).rows[0];
  return row && toTournamentContext(row);
}

type TournamentRow = {
  id: string;
  status: string;
  round_start_mode: TournamentRoundStartMode;
  structure: string;
  top_cut_enabled: boolean | null;
  top_cut_size: string | number | null;
  rules_snapshot: TournamentRules | string | null;
};

function toTournamentContext(row: TournamentRow): TournamentContext {
  return {
    id: row.id,
    structure: row.structure,
    status: row.status,
    roundStartMode: row.round_start_mode,
    topCutEnabled: row.top_cut_enabled === true,
    topCutSize: row.top_cut_size === null ? null : Number(row.top_cut_size),
    rules: typeof row.rules_snapshot === "string" ? JSON.parse(row.rules_snapshot) : row.rules_snapshot,
  };
}

const PHASE_COLUMNS = "id, kind, status, phase_order, planned_rounds, round_offset";

async function readPhases(db: Queryable, tournamentId: string): Promise<PhaseRecord[]> {
  return (
    await db.query<PhaseRow>(
      `SELECT ${PHASE_COLUMNS} FROM tournament_phases WHERE tournament_id=$1 ORDER BY phase_order`,
      [tournamentId],
    )
  ).rows.map(toPhase);
}

async function readPhase(db: Queryable, tournamentId: string): Promise<PhaseRecord | undefined> {
  const row = (
    await db.query<PhaseRow>(
      `SELECT ${PHASE_COLUMNS} FROM tournament_phases WHERE tournament_id=$1 AND kind='swiss' ORDER BY phase_order`,
      [tournamentId],
    )
  ).rows[0];
  return row && toPhase(row);
}

async function readPhaseById(db: Queryable, phaseId: string): Promise<PhaseRecord | undefined> {
  const row = (await db.query<PhaseRow>(`SELECT ${PHASE_COLUMNS} FROM tournament_phases WHERE id=$1`, [phaseId]))
    .rows[0];
  return row && toPhase(row);
}

type PhaseRow = {
  id: string;
  kind: PhaseView["kind"];
  status: PhaseView["status"];
  phase_order: string | number;
  planned_rounds: string | number | null;
  round_offset: string | number | null;
};

function toPhase(row: PhaseRow): PhaseRecord {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    phaseOrder: Number(row.phase_order),
    plannedRounds: row.planned_rounds === null ? null : Number(row.planned_rounds),
    roundOffset: row.round_offset === null ? 0 : Number(row.round_offset),
  };
}

const ROUND_COLUMNS = "id, phase_id, number, status, published_at";

async function readRounds(db: Queryable, phaseId: string): Promise<RoundRecord[]> {
  return (
    await db.query<RoundRow>(`SELECT ${ROUND_COLUMNS} FROM tournament_rounds WHERE phase_id=$1 ORDER BY number`, [
      phaseId,
    ])
  ).rows.map(toRound);
}

async function lockRound(client: PoolClient, roundId: string): Promise<RoundRecord | undefined> {
  const row = (
    await client.query<RoundRow>(`SELECT ${ROUND_COLUMNS} FROM tournament_rounds WHERE id=$1 FOR UPDATE`, [roundId])
  ).rows[0];
  return row && toRound(row);
}

type RoundRow = {
  id: string;
  phase_id: string;
  number: string | number;
  status: RoundView["status"];
  published_at: string | number | null;
};

function toRound(row: RoundRow): RoundRecord {
  return {
    id: row.id,
    phaseId: row.phase_id,
    number: Number(row.number),
    status: row.status,
    publishedAt: row.published_at === null ? null : Number(row.published_at),
  };
}

/**
 * The confirmed field: the participants `closeCheckIn` left `active`. A participant who drops mid
 * tournament leaves this list and is therefore never paired again — while every ledger row they
 * already earned stays, so their past opponents keep the tiebreaker credit they played for.
 */
async function readRoster(db: Queryable, tournamentId: string): Promise<RosterEntry[]> {
  return (
    await db.query<{ id: string; kind: ParticipantKind; account_id: string | null; seed: string | number | null }>(
      `SELECT id, kind, account_id, seed FROM tournament_participants
       WHERE tournament_id=$1 AND status='active' ORDER BY created_at, id`,
      [tournamentId],
    )
  ).rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    accountId: row.account_id,
    seed: row.seed === null ? null : Number(row.seed),
  }));
}

/**
 * The ledger, optionally cut off after a round.
 *
 * `lastRound` is what keeps one phase's projection out of another's: rounds are numbered across the
 * whole tournament (migration 009), so "the Swiss phase's results" is "rounds 1..plannedRounds" and
 * nothing else.
 */
async function readLedger(
  db: Queryable,
  tournamentId: string,
  lastRound: number | null = null,
): Promise<LedgerEntry[]> {
  return (
    await db.query<{
      participant_id: string;
      opponent_id: string | null;
      opponent_kind: ParticipantKind | null;
      round_number: string | number;
      outcome: MatchOutcome;
    }>(
      `SELECT participant_id, opponent_id, opponent_kind, round_number, outcome
       FROM tournament_result_ledger
       WHERE tournament_id=$1 AND ($2::int IS NULL OR round_number <= $2::int)
       ORDER BY round_number, participant_id`,
      [tournamentId, lastRound],
    )
  ).rows.map((row) => ({
    participantId: row.participant_id,
    opponentId: row.opponent_id,
    opponentKind: row.opponent_kind,
    roundNumber: Number(row.round_number),
    outcome: row.outcome,
  }));
}

/**
 * The participant an account is seated as IN THIS TOURNAMENT. Scoped by tournament on purpose: one
 * account holds a different participant row in every event it enters, and an unscoped lookup would
 * happily ledger a result against the wrong one.
 */
async function participantOf(
  db: Queryable,
  tournamentId: string,
  accountId: string,
): Promise<MatchParticipant | undefined> {
  const row = (
    await db.query<{ id: string; kind: ParticipantKind; account_id: string | null }>(
      "SELECT id, kind, account_id FROM tournament_participants WHERE tournament_id=$1 AND account_id=$2",
      [tournamentId, accountId],
    )
  ).rows[0];
  return row && { id: row.id, kind: row.kind, accountId: row.account_id };
}

async function accountOf(db: Queryable, participantId: string): Promise<string | null> {
  return (
    (
      await db.query<{ account_id: string | null }>("SELECT account_id FROM tournament_participants WHERE id=$1", [
        participantId,
      ])
    ).rows[0]?.account_id ?? null
  );
}

function ok<T>(value: T): SwissResult<T> {
  return { ok: true, value };
}

function failure<T>(reason: SwissFailure, detail?: string): SwissResult<T> {
  return { ok: false, reason, detail };
}
