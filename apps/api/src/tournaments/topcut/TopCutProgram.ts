import { TournamentRoundStartMode } from "@aegis/shared/tournaments/TournamentRoundStartMode";
import { grantTournamentTrophies } from "#api/achievements/grantTournamentTrophies";
import { randomUUID } from "node:crypto";
import type { LedgerEntry, MatchOutcome, ParticipantKind, StandingsRow, TournamentRules } from "@aegis/shared";
import type { PoolClient } from "pg";
import type { AccountStore } from "../../accounts/AccountStore.js";
import type { Queryable } from "../../db/migrator.js";
import { appendTournamentEvent } from "../audit/index.js";
import { type BracketView, EliminationStore } from "../elimination/index.js";
import { type AcquireTournamentLock, inProcessTournamentLock } from "../participants/index.js";
import { computeStandings } from "../standings/index.js";
import { standingsConfig } from "../swiss/index.js";

export type TopCutFailure = "tournament_not_found" | "swiss_phase_not_frozen" | "bot_participant_in_cut";

export type TopCutResult<T> = { ok: true; value: T } | { ok: false; reason: TopCutFailure; detail?: string };

/** What one attempt at the transition did, so a caller can log it without re-reading the database. */
export type TopCutOutcome =
  | { kind: "awaiting_manual_start" }
  | { kind: "already_started"; phaseId: string; bracket: BracketView }
  | { kind: "started"; phaseId: string; bracket: BracketView; seeds: TopCutSeed[] }
  | { kind: "finished_without_cut"; winnerParticipantId: string | null };

/** One participant the cut admitted, with the standings rank the seed came from. */
export type TopCutSeed = { participantId: string; rank: number; seed: number };

/**
 * The seam between the Swiss phase and its Top Cut.
 *
 * It lives in neither of the modules it joins, and deliberately. `SwissProgram` may not depend on a
 * bracket — it would then have to know how a bracket is drawn to end an event. `EliminationStore`
 * may not depend on standings — `bracket.ts` says so in as many words, because a bracket that
 * re-derived its seeding from a mutable projection would draw a different cut every time it was
 * re-read. This module is what knows both, and it is the only thing that does.
 *
 * ## What one transition is
 *
 * Everything below happens in ONE transaction, under the tournament's lock:
 *
 *  1. the final Swiss standings are projected one last time and PERSISTED, row by row, into
 *     `tournament_standings_snapshots`;
 *  2. the eligible participants are picked off that order, top down;
 *  3. their cut seeds, 1..N, are written onto `tournament_participants.top_cut_seed`;
 *  4. the Top Cut phase is drawn from exactly those seeds, mirrored (1 × N, 2 × N-1, …);
 *  5. the Swiss phase moves from `frozen` to `finished`.
 *
 * They commit together because none of them means anything alone. A snapshot with no bracket is a
 * frozen order nobody used; a bracket with no snapshot is a cut with no evidence; seeds written
 * without either are a bracket the next re-read would draw differently.
 *
 * ## Why the snapshot is stored rather than re-projected
 *
 * Standings are a projection of `tournament_result_ledger`, and the Top Cut writes its OWN ledger
 * rows as it is played. Re-projecting after the cut therefore no longer yields the order the cut
 * was made from — the cut's wins and losses are mixed into it. The snapshot is the immutable
 * evidence of the decision, and it records `eligible` and `cut_seed` alongside the numbers so the
 * question "why is the ninth-placed player in the Top 8?" is answerable from the stored rows alone.
 *
 * ## Eligibility and the cut line
 *
 * "The first `topCutSize` ELIGIBLE participants" (implementation plan, "Entrada no Top Cut"): a
 * participant who dropped or was disqualified keeps their standings row — their results are real
 * and their opponents' tiebreakers depend on them — but they cannot be seated in a bracket they
 * have left, so the walk skips them and the next eligible player moves up. `topCutSize` itself is
 * never resized: it was frozen from the confirmed field at check-in close, and a later drop must
 * not shrink or grow the cut.
 *
 * There is no play-in for a tie at the cut line. `computeStandings` produces a TOTAL order — points,
 * then the ruleset's criteria, then registration seed, then participant id — so the boundary between
 * 8th and 9th is always decided, and it is decided by the same rule that decides every other
 * position. The two players' records may be identical; their standings positions are not.
 *
 * ## Idempotency and what actually serializes the callers
 *
 * The transition is reached from three places — the round-close notification, the sweep, and the
 * organizer's manual nudge — and they will race.
 *
 * **The row lock is the guarantee.** `SELECT … FOR UPDATE` on the tournament is taken as the first
 * act of the transaction and held to commit, so a second caller blocks there and finds the Top Cut
 * phase already created when it proceeds. The in-process lock is only an optimisation, and only
 * between callers that share THIS instance — which is why `index.ts` passes the runtime singleton
 * into the routes rather than letting them construct their own. Across processes (blue/green, more
 * than one API instance) it does nothing at all, and the row lock is doing all the work.
 *
 * Behind it, every step still restates what it expects to find: the snapshot's unique index makes a
 * second freeze insert nothing, an existing Top Cut phase short-circuits the whole thing, and the
 * seed write is by value rather than by increment.
 *
 * ## Known limit: a drop DURING the cut stalls its bracket
 *
 * Eligibility is decided once, at the freeze. A player who drops after being seated has no bracket
 * effect at all: their confrontation stays `pending`, nobody advances, and the round waits. That is
 * deliberate — a bracket is not a Swiss round and cannot simply re-pair around an absence, and
 * awarding the win automatically would let a concession decide a title with nothing audited. The
 * resolution is the arbitration slice's judge commands (disqualify / award), landing in a parallel
 * branch; until then the attendance ladder's no-show path is what moves such a match, and anything
 * it cannot settle parks on `needs_organizer_decision` by design.
 */
export class TopCutProgram {
  constructor(
    private readonly accounts: AccountStore,
    private readonly elimination: EliminationStore,
    private readonly acquireLock: AcquireTournamentLock = inProcessTournamentLock(),
  ) {}

  /**
   * Runs the transition for one tournament, if its Swiss phase is sitting frozen and waiting for it.
   *
   * Safe to call on anything: an event with no frozen phase, no cut configured, or a Top Cut that
   * already exists all report what they are and write nothing.
   */
  async startTopCut(
    tournamentId: string,
    now: number = Date.now(),
    automatic = false,
  ): Promise<TopCutResult<TopCutOutcome>> {
    const release = await this.acquireLock(tournamentId);
    try {
      await this.accounts.ensureReady();
      const client = await this.accounts.pool.connect();
      try {
        await client.query("BEGIN");
        const result = await this.transition(client, tournamentId, now, automatic);
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

  /**
   * The recovery path, and the reason a lost notification costs latency rather than a stalled
   * event: every Swiss phase parked in `frozen` is a transition that has not happened yet.
   *
   * Cheap on every tick — one indexed query, and a tournament whose cut already exists costs one
   * short-circuit and no writes. Wired into the deadline worker's sweep alongside
   * `SwissProgram.sweepOpenTournaments`.
   */
  async sweepFrozenSwissPhases(now: number = Date.now()): Promise<number> {
    await this.accounts.ensureReady();
    const candidates = (
      await this.accounts.pool.query<{ tournament_id: string }>(
        "SELECT DISTINCT p.tournament_id FROM tournament_phases p JOIN tournaments t ON t.id=p.tournament_id WHERE p.kind='swiss' AND p.status='frozen' AND t.status='in_progress' AND t.round_start_mode=$1",
        [TournamentRoundStartMode.AUTOMATIC.value],
      )
    ).rows.map((row) => row.tournament_id);
    let advanced = 0;
    for (const tournamentId of candidates) {
      const result = await this.startTopCut(tournamentId, now, true);
      if (!result.ok) {
        console.error(`[TopCutProgram] sweep could not cut ${tournamentId}: ${result.reason} ${result.detail ?? ""}`);
        continue;
      }
      if (result.value.kind === "started" || result.value.kind === "finished_without_cut") advanced += 1;
    }
    return advanced;
  }

  /** The frozen standings of a phase, as evidence rather than as a projection. */
  async snapshot(tournamentId: string): Promise<TopCutSnapshotRow[]> {
    await this.accounts.ensureReady();
    return readSnapshot(this.accounts.pool, tournamentId);
  }

  /**
   * The standings to PUBLISH for this event, once they have been frozen.
   *
   * `undefined` while no snapshot exists, so the caller falls back to the live Swiss projection.
   * Once one does exist it is the answer, and re-projecting is never correct again: the final
   * standings of the Swiss phase are a settled fact, and the only thing that could still change
   * them is the Top Cut writing its own results into the same ledger.
   *
   * This is also what gives `tournament_standings_snapshots` a reader. A table written and never
   * read is a claim of evidence rather than evidence — the same trap the dead-IR audit exists to
   * catch elsewhere in this codebase.
   */
  async frozenStandings(tournamentId: string): Promise<StandingsRow[] | undefined> {
    await this.accounts.ensureReady();
    const rows = await readFrozenStandings(this.accounts.pool, tournamentId);
    return rows.length === 0 ? undefined : rows;
  }

  private async transition(
    client: PoolClient,
    tournamentId: string,
    now: number,
    automatic: boolean,
  ): Promise<TopCutResult<TopCutOutcome>> {
    const tournament = await lockTournament(client, tournamentId);
    if (!tournament || tournament.status === "cancelled") {
      return { ok: false, reason: "tournament_not_found" };
    }
    if (automatic && tournament.roundStartMode === TournamentRoundStartMode.MANUAL.value) {
      return { ok: true, value: { kind: "awaiting_manual_start" } };
    }

    const swissPhase = await readSwissPhase(client, tournamentId);
    if (!swissPhase) return { ok: false, reason: "swiss_phase_not_frozen", detail: "no swiss phase" };

    const cutPhase = await readCutPhase(client, tournamentId);
    if (cutPhase)
      return {
        ok: true,
        value: {
          kind: "already_started",
          phaseId: cutPhase,
          bracket: (await this.elimination.bracketOn(client, tournamentId))!,
        },
      };

    if (swissPhase.status !== "frozen")
      return { ok: false, reason: "swiss_phase_not_frozen", detail: swissPhase.status };
    // Belt and braces: `SwissProgram` only freezes a phase when the size is positive, so a frozen
    // phase with no cut size is a corrupted row rather than a supported state. Finishing the event
    // by standings is the same thing the Swiss path would have done, and is strictly better than
    // leaving it parked for ever.
    const size = tournament.topCutSize ?? 0;

    const standings = await this.standingsOn(client, tournament);
    const eligible = new Set(await readEligibleParticipants(client, tournamentId));
    const cut = size <= 0 ? [] : standings.filter((row) => eligible.has(row.participantId)).slice(0, size);
    const seeds: TopCutSeed[] = cut.map((row, index) => ({
      participantId: row.participantId,
      rank: row.rank,
      seed: index + 1,
    }));
    // A cut is the part of an event that decides a title, and a bot may not be in it. No official
    // preset seats one, so reaching this is a corrupted field rather than a supported configuration
    // — and the refusal is structural on purpose: a bot in a bracket would advance by the deadline
    // ladder alone (it is present by definition, so its human opponent is the only seat that can be
    // penalised for absence) and could take the title without a judge ever seeing it. Refusing rolls
    // the whole transition back and leaves the Swiss phase frozen for an organizer to fix.
    const bot = await findBotParticipant(
      client,
      tournamentId,
      seeds.map((entry) => entry.participantId),
    );
    if (bot) return { ok: false, reason: "bot_participant_in_cut", detail: bot };

    // Seeds are recorded in the snapshot only if a bracket is actually drawn from them. A snapshot
    // that carried "seed 1" for an event that ended by standings would be evidence of a seeding
    // that never existed.
    const drawsBracket = seeds.length >= 2;
    const seedOf = new Map(drawsBracket ? seeds.map((entry) => [entry.participantId, entry.seed]) : []);

    await this.freezeSnapshot(client, tournamentId, swissPhase.id, standings, eligible, seedOf, now);

    // Below two entrants there is no bracket to draw — a mass drop after the freeze, or a cut size
    // of zero on a corrupted row. The event ends the way a Swiss event without a cut ends: by the
    // standings, crowning the leader who is still in it.
    if (!drawsBracket) {
      await client.query("UPDATE tournament_phases SET status='finished' WHERE id=$1", [swissPhase.id]);
      const winner = cut[0] ?? standings.find((row) => eligible.has(row.participantId)) ?? null;
      const winnerAccountId = winner ? await accountOf(client, winner.participantId) : null;
      await client.query(
        "UPDATE tournaments SET status='finished', winner_account_id=$1 WHERE id=$2 AND status<>'finished'",
        [winnerAccountId, tournamentId],
      );
      await appendTournamentEvent(client, {
        tournamentId,
        actorKind: "system",
        actorId: "system",
        command: "tournament_finished",
        commandId: `tournament_finished:${tournamentId}`,
        reason: "fewer than two eligible participants remain for Top Cut",
        reasonCode: "finished_without_cut",
        subjectKind: "tournament",
        subjectId: tournamentId,
        phaseId: swissPhase.id,
        participantId: winner?.participantId ?? null,
        after: { winnerParticipantId: winner?.participantId ?? null, winnerAccountId },
        now,
      });
      await grantTournamentTrophies({ db: client, tournamentId, standings: async () => standings, now });
      return { ok: true, value: { kind: "finished_without_cut", winnerParticipantId: winner?.participantId ?? null } };
    }

    for (const entry of seeds)
      await client.query("UPDATE tournament_participants SET top_cut_seed=$1 WHERE id=$2", [
        entry.seed,
        entry.participantId,
      ]);

    // The bracket reads the seeds back off the rows written just above, in this same transaction,
    // rather than taking them as an argument — so the stored value is the one the draw uses.
    const bracket = await this.elimination.publishSeededBracket({
      client,
      tournamentId,
      kind: "top_cut",
      participantIds: seeds.map((entry) => entry.participantId),
      now,
    });
    await client.query("UPDATE tournament_phases SET status='finished' WHERE id=$1", [swissPhase.id]);

    // In the SAME transaction as the draw, for the same reason every other event is: a trail row
    // that outlived a rolled-back cut would describe a bracket nobody played. The snapshot phase is
    // recorded alongside the seeds because it is what the seeds were read off — the pair is what
    // makes "why was this player seed 3?" answerable from the trail without re-projecting anything.
    await appendTournamentEvent(client, {
      tournamentId,
      actorKind: "system",
      actorId: "system",
      command: "top_cut_started",
      commandId: `top_cut_started:${bracket.phaseId}`,
      reason: `the Top ${seeds.length} was drawn from the frozen Swiss standings`,
      reasonCode: "top_cut_started",
      subjectKind: "phase",
      subjectId: bracket.phaseId,
      phaseId: bracket.phaseId,
      after: {
        topCutSize: size,
        snapshotPhaseId: swissPhase.id,
        seededParticipantIds: seeds.map((entry) => entry.participantId),
      },
      now,
    });
    return { ok: true, value: { kind: "started", phaseId: bracket.phaseId, bracket, seeds } };
  }

  /**
   * Writes the standings as they stand, once, for every participant — not only the ones that made
   * the cut. Everybody's final position is part of the record: prizes, ratings and any later
   * dispute are all about the whole order, not the top eight of it.
   */
  private async freezeSnapshot(
    client: PoolClient,
    tournamentId: string,
    phaseId: string,
    standings: readonly StandingsRow[],
    eligible: ReadonlySet<string>,
    seedOf: ReadonlyMap<string, number>,
    now: number,
  ): Promise<void> {
    for (const row of standings)
      await client.query(
        `INSERT INTO tournament_standings_snapshots
           (id, tournament_id, phase_id, participant_id, rank, points, match_win_rate, opponent_match_win_rate,
            wins, losses, draws, byes, eligible, cut_seed, frozen_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (phase_id, participant_id) DO NOTHING`,
        [
          randomUUID(),
          tournamentId,
          phaseId,
          row.participantId,
          row.rank,
          row.points,
          row.matchWinRate,
          row.opponentMatchWinRate,
          row.wins,
          row.losses,
          row.draws,
          row.byes,
          eligible.has(row.participantId),
          seedOf.get(row.participantId) ?? null,
          now,
        ],
      );
  }

  private async standingsOn(client: PoolClient, tournament: TournamentContext): Promise<StandingsRow[]> {
    const [ledger, roster] = await Promise.all([readLedger(client, tournament.id), readRoster(client, tournament.id)]);
    return computeStandings({
      ledger,
      standings: standingsConfig(tournament.rules, tournament.id),
      participants: roster,
      drawSeed: tournament.id,
    });
  }
}

export type TopCutSnapshotRow = {
  participantId: string;
  rank: number;
  points: number;
  eligible: boolean;
  cutSeed: number | null;
};

type TournamentContext = {
  status: string;
  roundStartMode: TournamentRoundStartMode;
  id: string;
  topCutSize: number | null;
  rules: TournamentRules | null;
};

async function lockTournament(client: PoolClient, id: string): Promise<TournamentContext | undefined> {
  const row = (
    await client.query<{
      status: string;
      round_start_mode: TournamentRoundStartMode;
      id: string;
      top_cut_size: string | number | null;
      rules_snapshot: unknown;
    }>("SELECT id, status, round_start_mode, top_cut_size, rules_snapshot FROM tournaments WHERE id=$1 FOR UPDATE", [
      id,
    ])
  ).rows[0];
  if (!row) return undefined;
  return {
    id: row.id,
    status: row.status,
    roundStartMode: row.round_start_mode,
    topCutSize: row.top_cut_size === null ? null : Number(row.top_cut_size),
    rules: (typeof row.rules_snapshot === "string"
      ? JSON.parse(row.rules_snapshot)
      : row.rules_snapshot) as TournamentRules | null,
  };
}

async function readSwissPhase(
  client: PoolClient,
  tournamentId: string,
): Promise<{ id: string; status: string } | undefined> {
  return (
    await client.query<{ id: string; status: string }>(
      "SELECT id, status FROM tournament_phases WHERE tournament_id=$1 AND kind='swiss' ORDER BY phase_order LIMIT 1",
      [tournamentId],
    )
  ).rows[0];
}

async function readCutPhase(client: PoolClient, tournamentId: string): Promise<string | undefined> {
  return (
    await client.query<{ id: string }>(
      "SELECT id FROM tournament_phases WHERE tournament_id=$1 AND kind='top_cut' ORDER BY phase_order LIMIT 1",
      [tournamentId],
    )
  ).rows[0]?.id;
}

/**
 * Who may still be seated. `status='active'` is exactly the participants `closeCheckIn` confirmed
 * minus everyone who has dropped or been disqualified since — the same definition the Swiss pairer
 * uses, so "in the event" means one thing everywhere.
 */
async function readEligibleParticipants(client: PoolClient, tournamentId: string): Promise<string[]> {
  return (
    await client.query<{ id: string }>(
      "SELECT id FROM tournament_participants WHERE tournament_id=$1 AND status='active'",
      [tournamentId],
    )
  ).rows.map((row) => row.id);
}

/**
 * The first of these participants that is a bot, if any.
 *
 * Reads the tournament's bots and intersects in memory rather than passing an id array to the
 * database: an event's bot fill is a handful of rows at most, and `= ANY($1::uuid[])` is not
 * supported by the in-memory engine the database tests run on.
 */
async function findBotParticipant(
  client: PoolClient,
  tournamentId: string,
  participantIds: readonly string[],
): Promise<string | undefined> {
  if (participantIds.length === 0) return undefined;
  const bots = new Set(
    (
      await client.query<{ id: string }>(
        "SELECT id FROM tournament_participants WHERE tournament_id=$1 AND kind='bot'",
        [tournamentId],
      )
    ).rows.map((row) => row.id),
  );
  return participantIds.find((id) => bots.has(id));
}

async function accountOf(client: PoolClient, participantId: string): Promise<string | null> {
  return (
    (
      await client.query<{ account_id: string | null }>("SELECT account_id FROM tournament_participants WHERE id=$1", [
        participantId,
      ])
    ).rows[0]?.account_id ?? null
  );
}

/**
 * The roster the standings are projected over. Deliberately the SAME query `SwissProgram` uses —
 * the participants still `active` — so the frozen snapshot is byte-for-byte the order the detail
 * view was showing a moment earlier. A player who dropped still appears in the projection, because
 * their ledger rows are still there; they simply carry no registration seed into the final
 * tiebreak, exactly as they did before the freeze.
 */
async function readRoster(client: PoolClient, tournamentId: string): Promise<{ id: string; seed: number | null }[]> {
  return (
    await client.query<{ id: string; seed: string | number | null }>(
      "SELECT id, seed FROM tournament_participants WHERE tournament_id=$1 AND status='active' ORDER BY created_at, id",
      [tournamentId],
    )
  ).rows.map((row) => ({ id: row.id, seed: row.seed === null ? null : Number(row.seed) }));
}

async function readLedger(client: PoolClient, tournamentId: string): Promise<LedgerEntry[]> {
  return (
    await client.query<{
      participant_id: string;
      opponent_id: string | null;
      opponent_kind: ParticipantKind | null;
      round_number: string | number;
      outcome: MatchOutcome;
    }>(
      `SELECT participant_id, opponent_id, opponent_kind, round_number, outcome
       FROM tournament_result_ledger WHERE tournament_id=$1 ORDER BY round_number, participant_id`,
      [tournamentId],
    )
  ).rows.map((row) => ({
    participantId: row.participant_id,
    opponentId: row.opponent_id,
    opponentKind: row.opponent_kind,
    roundNumber: Number(row.round_number),
    outcome: row.outcome,
  }));
}

/** The snapshot, read back in the shape the standings contract publishes. */
async function readFrozenStandings(db: Queryable, tournamentId: string): Promise<StandingsRow[]> {
  return (
    await db.query<{
      participant_id: string;
      rank: string | number;
      points: string | number;
      match_win_rate: string | number;
      opponent_match_win_rate: string | number;
      wins: string | number;
      losses: string | number;
      draws: string | number;
      byes: string | number;
    }>(
      `SELECT participant_id, rank, points, match_win_rate, opponent_match_win_rate, wins, losses, draws, byes
       FROM tournament_standings_snapshots WHERE tournament_id=$1 ORDER BY rank`,
      [tournamentId],
    )
  ).rows.map((row) => ({
    participantId: row.participant_id,
    rank: Number(row.rank),
    points: Number(row.points),
    matchWinRate: Number(row.match_win_rate),
    opponentMatchWinRate: Number(row.opponent_match_win_rate),
    wins: Number(row.wins),
    losses: Number(row.losses),
    draws: Number(row.draws),
    byes: Number(row.byes),
  }));
}

async function readSnapshot(db: Queryable, tournamentId: string): Promise<TopCutSnapshotRow[]> {
  return (
    await db.query<{
      participant_id: string;
      rank: string | number;
      points: string | number;
      eligible: boolean;
      cut_seed: string | number | null;
    }>(
      `SELECT participant_id, rank, points, eligible, cut_seed
       FROM tournament_standings_snapshots WHERE tournament_id=$1 ORDER BY rank`,
      [tournamentId],
    )
  ).rows.map((row) => ({
    participantId: row.participant_id,
    rank: Number(row.rank),
    points: Number(row.points),
    eligible: row.eligible === true,
    cutSeed: row.cut_seed === null ? null : Number(row.cut_seed),
  }));
}
