import { LIVE_GAME_GRACE_MS } from "#api/tournaments/rules/liveGameGraceMs";
import { randomUUID } from "node:crypto";
import type { TournamentRules } from "@aegis/shared";
import type { AccountStore, Tournament } from "../../accounts/AccountStore.js";
import type { Queryable } from "../../db/migrator.js";
import { log, logError } from "../../logger.js";
import { appendTournamentEvent } from "../audit/index.js";
import { seriesDurationFor } from "../rules/clocks.js";
import { matchClockContext } from "../series/matchClock.js";
import {
  absentSeats,
  type MatchPresence,
  type SeriesOfficialResult,
  type SeriesRecord,
  type SeriesStatus,
  type SeriesStore,
  type SeriesTimeoutPolicy,
} from "../series/SeriesStore.js";
import { DeadlineQueue, type DeadlineKind, type DeadlineRecord } from "./DeadlineQueue.js";

/** Wall clock as a value, so no branch in this module ever calls `Date.now()` itself. */
export type Clock = () => number;

/**
 * Why a deadline row stopped where it did. Recorded on the row and logged, so a command that
 * correctly did nothing is distinguishable from one that never ran.
 */
export type DeadlineResultCode =
  | "game_loss_applied"
  | "match_loss_applied"
  | "both_absent_no_penalty"
  | "double_no_show_resolved"
  | "double_no_show_needs_organizer_decision"
  | "series_resolved"
  | "series_needs_organizer_decision"
  | "cancelled_both_present"
  | "cancelled_series_closed"
  | "skipped_no_rules_snapshot"
  | "skipped_tournament_closed"
  | "skipped_no_join_deadline"
  | "skipped_subject_missing"
  | "skipped_no_opponent"
  | "retry_deadline_not_reached"
  | "retry_presence_changed"
  | "postponed_game_in_progress";

/**
 * An outcome, and whether it is the row's last word.
 *
 * A retryable outcome is not a result: it means the command could not answer yet — the clock moved
 * under it, or presence changed between deciding and writing. Retiring the row on one of those
 * would silently drop a penalty, so the lease is released instead and the next pass, seconds
 * later, asks again. Only terminal outcomes retire a row and count as work done.
 */
type Outcome = { code: DeadlineResultCode; retry?: true; postponeTo?: number };

/**
 * Which outcomes go into the audit ledger. Exactly the ones that changed the tournament: a rung
 * that cancelled itself, or skipped a subject that had gone, decided nothing and belongs on the
 * queue row and in the log rather than in a trail meant to be read by a human.
 */
const AUDITED_DEADLINE_RESULTS = new Set<DeadlineResultCode>([
  "game_loss_applied",
  "match_loss_applied",
  "double_no_show_resolved",
  "double_no_show_needs_organizer_decision",
  "series_resolved",
  "series_needs_organizer_decision",
]);

const TERMINAL = (code: DeadlineResultCode): Outcome => ({ code });
const RETRY = (code: DeadlineResultCode): Outcome => ({ code, retry: true });
const POSTPONE = (code: DeadlineResultCode, postponeTo: number): Outcome => ({ code, postponeTo });

/**
 * Runs the tournament's persisted deadlines.
 *
 * Two things make this safe to run on every API instance at once. Rows are claimed under
 * `FOR UPDATE SKIP LOCKED` with a short lease, so instances take disjoint work and a dead
 * instance's work becomes claimable again on its own. And every command is idempotent, so the
 * cases the lease cannot cover — a lapsed lease, an overlap between fixed-slot instances — apply
 * once anyway.
 *
 * Every policy number is read from the tournament's frozen `rules_snapshot`. There is no constant
 * in this file for a grace period, a penalty threshold or a tie rule: an event created last month
 * must resolve by the rules it was created under, not by whatever the presets say today.
 *
 * ## The attendance timeline
 *
 * All three attendance numbers are offsets from ONE origin: the moment the round was published,
 * when the confrontation became playable. The queue does not store that origin — it stores the
 * `join_deadline_at` the round publisher wrote and the UI counts down to — so this module derives
 * it back out: `base = join_deadline_at - joinGraceMs`. All three values come from the same frozen
 * snapshot, so the derivation cannot disagree with the value it inverts.
 *
 *     base ──── joinGraceMs ────▶ join_deadline_at
 *     base ──── gameLossAtMs ───▶ game-loss rung
 *     base ──── matchLossAtMs ──▶ match-loss rung
 *
 * With the pinned presets (grace = game loss = 5 min, match loss = 10 min) the game-loss rung
 * lands exactly on `join_deadline_at` and the match loss five minutes later, which is the manual's
 * "game loss at 5 minutes late, match loss at 10". Reading the penalties as offsets from
 * `join_deadline_at` instead would put them at 10 and 15 minutes, which is the misreading this
 * derivation exists to make impossible.
 */
export class DeadlineScheduler {
  readonly queue: DeadlineQueue;
  private readonly workerId = randomUUID();

  constructor(
    private readonly accounts: AccountStore,
    private readonly series: SeriesStore,
    queue?: DeadlineQueue,
  ) {
    this.queue = queue ?? new DeadlineQueue(accounts);
  }

  /**
   * Starts the attendance ladder for one confrontation, from the `join_deadline_at` its round
   * publication wrote.
   *
   * `dueAt` is the join deadline itself — the instant the UI counts down to — and NOT when the
   * first penalty applies. This derives that: the first rung is queued at `base + gameLossAtMs`,
   * or straight at `base + matchLossAtMs` for a ruleset with no game-loss step.
   *
   * Returns whether a ladder was queued. `false` means one already exists for this match, which is
   * ordinarily a duplicate call and harmless — but note that a match re-published after an
   * arbitration decision would also read as already-laddered and get no second ladder. That is a
   * deliberate gap, not an oversight: re-arming a retired ladder is an arbitration concern, and
   * D2 owns it. The caller is given the boolean so a re-publication path can notice.
   */
  async enqueueJoinDeadline(input: {
    tournamentId: string;
    matchId: string;
    dueAt: number;
    now: number;
  }): Promise<boolean> {
    const tournament = await this.accounts.tournament(input.tournamentId);
    const rules = tournament?.rules;
    if (!rules) {
      logError(
        `[TOURNAMENT_DEADLINE] ${JSON.stringify({
          tournamentId: input.tournamentId,
          matchId: input.matchId,
          outcome: "no_rules_snapshot_at_enqueue",
        })}`,
      );
      return false;
    }
    const first = firstRung(rules, input.dueAt - rules.attendance.joinGraceMs);
    const queued = await this.queue.enqueue({
      kind: first.kind,
      tournamentId: input.tournamentId,
      subjectId: input.matchId,
      dueAt: first.dueAt,
      now: input.now,
    });
    if (!queued)
      log(
        `[TOURNAMENT_DEADLINE] ${JSON.stringify({
          tournamentId: input.tournamentId,
          matchId: input.matchId,
          outcome: "ladder_already_queued",
        })}`,
      );
    return queued;
  }

  /**
   * Arms the attendance ladder for every published match that does not have one yet.
   *
   * Round publication writes `join_deadline_at` but runs inside the Swiss/Top Cut transaction,
   * which cannot see this queue's module; the worker's sweep calls this instead. `NOT EXISTS` over
   * ALL ladder kinds — including retired rows — keeps two policies at once: a match is never
   * re-armed after its ladder ran (the deliberate no-second-ladder rule), and a crash between
   * publication and the first sweep costs one tick of latency, never a missing ladder.
   */
  async armPendingJoinLadders(now: number): Promise<number> {
    await this.accounts.ensureReady();
    // LEFT JOIN + IS NULL rather than NOT EXISTS: pg-mem cannot resolve the outer alias inside a
    // correlated subquery. Semantically identical — a match with ANY ladder row, retired or live,
    // is excluded.
    const pending = await this.accounts.pool.query(
      `SELECT m.id, m.tournament_id, m.join_deadline_at
         FROM tournament_matches m
         LEFT JOIN tournament_deadlines d
           ON d.subject_id = m.id
          AND d.kind IN ('join_deadline', 'join_game_loss', 'join_match_loss')
        WHERE m.join_deadline_at IS NOT NULL
          AND m.status = 'pending'
          AND d.id IS NULL`,
    );
    let armed = 0;
    for (const row of pending.rows) {
      const queued = await this.enqueueJoinDeadline({
        tournamentId: row.tournament_id as string,
        matchId: row.id as string,
        dueAt: Number(row.join_deadline_at),
        now,
      });
      if (queued) armed += 1;
    }
    return armed;
  }

  /**
   * Claims every due row this worker can take, runs it, and reports how many it retired.
   *
   * The count is of rows THIS call recorded a terminal outcome for: neither a row another worker
   * recorded first nor a row released for retry counts, which is what makes "exactly once" an
   * observable number rather than a claim.
   *
   * One failing command does not abandon the batch. Its lease is left to lapse so a later pass
   * retries it, which is only correct because every command is idempotent.
   *
   * A backlog — the queue after an outage, or after a restart — is drained here at full speed
   * rather than replayed in real time. Rungs that were hours late all fire within seconds of each
   * other, in due order, each re-checking the state it acts on. That is the intended recovery
   * behaviour: the penalties are decided by the instants recorded on the rows, not by when the
   * process happened to come back.
   */
  async processDueDeadlines(now: number): Promise<number> {
    const claimed = await this.queue.claimDue(now, this.workerId);
    let executed = 0;
    for (const deadline of claimed) {
      let outcome: Outcome;
      try {
        await this.queue.renewLease(deadline.id, now, this.workerId);
        outcome = await this.execute(deadline, now);
      } catch (error) {
        logError(`[TOURNAMENT_DEADLINE] ${JSON.stringify({ ...context(deadline), outcome: "failed" })}`, error);
        continue;
      }
      if (outcome.postponeTo !== undefined) {
        await this.queue.postpone(deadline.id, outcome.postponeTo);
        log(
          `[TOURNAMENT_DEADLINE] ${JSON.stringify({ ...context(deadline), result: outcome.code, postponedTo: outcome.postponeTo })}`,
        );
        continue;
      }
      if (outcome.retry) {
        await this.queue.releaseLease(deadline.id);
        log(`[TOURNAMENT_DEADLINE] ${JSON.stringify({ ...context(deadline), result: outcome.code, retry: true })}`);
        continue;
      }
      const recorded = await this.queue.markExecuted(deadline.id, now, outcome.code);
      if (recorded) executed += 1;
      if (recorded) await this.recordDecision(deadline, outcome.code, now);
      log(
        `[TOURNAMENT_DEADLINE] ${JSON.stringify({
          ...context(deadline),
          result: outcome.code,
          recorded,
          workerId: this.workerId,
        })}`,
      );
    }
    return executed;
  }

  /**
   * Puts a machine decision in the same trail the organizer's decisions go into.
   *
   * The acceptance criterion is that EVERY action is reconstructible from the ledger, and a
   * confrontation lost to a clock is as much a decision as one a judge made — more common, and the
   * one a player is likelier to dispute. Only outcomes that actually changed the tournament are
   * recorded; a rung that found both players present and cancelled itself changed nothing and would
   * only be noise in a trail meant to be read.
   *
   * Written AFTER `markExecuted` rather than inside the command's transaction, which is the one
   * place this module's trail is weaker than arbitration's: the deadline row is the exactly-once
   * gate, so a crash in the gap loses the audit line but not the decision. Using the deadline id as
   * the command id keeps a retry a replay rather than a duplicate. The alternative — threading a
   * client through every command — would restructure the scheduler for a strictly smaller gain than
   * the queue's own `executed_at`/`result` columns already provide.
   */
  private async recordDecision(deadline: DeadlineRecord, code: DeadlineResultCode, now: number): Promise<void> {
    if (!AUDITED_DEADLINE_RESULTS.has(code)) return;
    try {
      await appendTournamentEvent(this.accounts.pool, {
        tournamentId: deadline.tournamentId,
        actorKind: "scheduler",
        actorId: "scheduler",
        command:
          code === "series_resolved" || code === "series_needs_organizer_decision"
            ? "deadline_resolved"
            : "administrative_loss",
        commandId: deadline.id,
        reason: `${deadline.kind} elapsed at ${deadline.dueAt}`,
        reasonCode: code,
        subjectKind: deadline.kind === "series_deadline" ? "series" : "match",
        subjectId: deadline.subjectId,
        matchId: deadline.kind === "series_deadline" ? null : deadline.subjectId,
        seriesId: deadline.kind === "series_deadline" ? deadline.subjectId : null,
        after: { result: code },
        now,
      });
    } catch (error) {
      // A trail that fails must never undo a decision that succeeded; the queue row still records it.
      logError(`[TOURNAMENT_DEADLINE] ${JSON.stringify({ ...context(deadline), outcome: "audit_failed" })}`, error);
    }
  }

  private async execute(deadline: DeadlineRecord, now: number): Promise<Outcome> {
    const tournament = await this.accounts.tournament(deadline.tournamentId);
    if (tournament && (tournament.status === "finished" || tournament.status === "cancelled")) {
      return TERMINAL("skipped_tournament_closed");
    }
    // Terminal, not retryable: a rules snapshot is frozen at creation and cannot appear later, so
    // an event without one will never grow one and retrying would spin for ever.
    if (!tournament?.rules) return TERMINAL("skipped_no_rules_snapshot");
    return deadline.kind === "series_deadline"
      ? this.runSeriesDeadline(deadline, tournament, now)
      : this.runAttendanceRung(deadline, tournament, tournament.rules, now);
  }

  /**
   * The shared clock ran out. The score on the board decides first; only a genuine tie reaches the
   * snapshot's timeout policy, and an elimination tie reaches nobody — it parks for a judge.
   */
  private async runSeriesDeadline(deadline: DeadlineRecord, tournament: Tournament, now: number): Promise<Outcome> {
    const resolved = await this.series.resolveSeriesByDeadline({
      seriesId: deadline.subjectId,
      policy: timeoutPolicyOf(tournament),
      commandId: deadline.id,
      now,
      liveGameGraceMs: LIVE_GAME_GRACE_MS,
    });
    if (!resolved.ok)
      // Retryable on purpose: overtime moves the deadline forward, so "not reached" means this row
      // has a later instant to fire at, not that it has nothing to do.
      return resolved.reason === "deadline_not_reached"
        ? RETRY("retry_deadline_not_reached")
        : TERMINAL("skipped_subject_missing");
    if (resolved.value.status === "overtime" && resolved.value.seriesDeadlineAt !== null)
      return POSTPONE("postponed_game_in_progress", resolved.value.seriesDeadlineAt + LIVE_GAME_GRACE_MS);
    return TERMINAL(this.reportSeries(deadline, resolved.value, "series_resolved", "series_needs_organizer_decision"));
  }

  /**
   * One rung of the attendance ladder, re-decided from the presence that exists right now.
   *
   * The ladder never advances blind. Whatever the previous rung concluded, this one reads presence
   * again: an opponent who turned up in the meantime cancels the remainder simply by not being
   * absent any more, and nothing further is enqueued.
   *
   * The read here is unlocked, so the decision it produces travels INTO the command as
   * `expectedAbsentSeats` and is re-checked under `FOR UPDATE` before anything is written. If
   * presence moved in between — both players arriving mid-command is precisely the case that would
   * otherwise kill a series a millisecond after it started — the command refuses and the row is
   * released to be decided again.
   *
   * Boundaries are INCLUSIVE: a rung applies at exactly its instant, never a millisecond later.
   */
  private async runAttendanceRung(
    deadline: DeadlineRecord,
    tournament: Tournament,
    rules: TournamentRules,
    now: number,
  ): Promise<Outcome> {
    const presence = await this.series.presence(deadline.subjectId);
    if (!presence || presence.tournamentId !== tournament.id) return TERMINAL("skipped_subject_missing");
    if (presence.joinDeadlineAt === null) return TERMINAL("skipped_no_join_deadline");
    if (presence.series && CLOSED_SERIES.includes(presence.series.status)) return TERMINAL("cancelled_series_closed");

    const alwaysPresent = await this.seatsPresentByDefinition(tournament, presence.participantAccountIds);
    if (alwaysPresent === undefined) return TERMINAL("skipped_no_opponent");
    const absent = absentSeats(presence.presentAt, alwaysPresent);
    if (absent.length === 0) return TERMINAL("cancelled_both_present");

    const base = presence.joinDeadlineAt - rules.attendance.joinGraceMs;
    const command = {
      tournamentId: tournament.id,
      matchId: deadline.subjectId,
      winsRequired: rules.match.winsRequired,
      seriesDurationMs: await seriesDurationOf(this.accounts.pool, rules, deadline.subjectId),
      expectedAbsentSeats: absent,
      alwaysPresentSeats: alwaysPresent,
      commandId: deadline.id,
      now,
    };

    return deadline.kind === "join_game_loss"
      ? this.runGameLossRung({
          deadline,
          tournament,
          rules,
          command,
          absent,
          presence,
          base,
          now,
        })
      : this.runMatchLossRung(tournament, command, absent, presence.participantAccountIds);
  }

  /**
   * The first penalty. One absentee loses a game; both absent lose nothing yet.
   *
   * A double no-show is NOT resolved here. At this instant the confrontation is five minutes old
   * and either player can still walk in and play it; ending it now would take a match away from
   * two people over a rung that, for a single absentee, costs only one game. So the ladder walks
   * on and the match-loss rung — the instant the manual says the whole confrontation is forfeit —
   * is where two empty seats end it.
   */
  private async runGameLossRung(input: {
    deadline: DeadlineRecord;
    tournament: Tournament;
    rules: TournamentRules;
    command: AdministrativeInput;
    absent: readonly (0 | 1)[];
    presence: MatchPresence;
    base: number;
    now: number;
  }): Promise<Outcome> {
    const { deadline, tournament, rules, command, absent, presence, base, now } = input;
    const nextRung = { kind: "join_match_loss" as const, dueAt: base + rules.attendance.matchLossAtMs };
    if (absent.length === 2) {
      await this.queue.enqueue({
        ...nextRung,
        tournamentId: tournament.id,
        subjectId: deadline.subjectId,
        now,
      });
      return TERMINAL("both_absent_no_penalty");
    }

    const absentee = presence.participantAccountIds[absent[0]!];
    if (!absentee) return TERMINAL("skipped_subject_missing");
    const lost = await this.series.recordAdministrativeGameLoss({
      ...command,
      loserAccountId: absentee,
      commandId: deadline.id,
      reason: "administrative_game_loss_no_show",
    });
    if (!lost.ok)
      return lost.reason === "presence_changed" ? RETRY("retry_presence_changed") : TERMINAL("skipped_subject_missing");

    if (!CLOSED_SERIES.includes(lost.value.status))
      await this.queue.enqueue({ ...nextRung, tournamentId: tournament.id, subjectId: deadline.subjectId, now });
    // No warning is recorded alongside this, and there is nothing to record. Presence is
    // first-arrival-wins and never cleared, so a player who arrived late but inside the grace is
    // simply present, and this rung never runs against them. "Warned" and "penalised" are
    // mutually exclusive states here, which is why the warning needs neither a row nor a code.
    return TERMINAL("game_loss_applied");
  }

  /** The last rung: the absentee forfeits the confrontation, or two empty seats end it by policy. */
  private async runMatchLossRung(
    tournament: Tournament,
    command: AdministrativeInput,
    absent: readonly (0 | 1)[],
    participantAccountIds: readonly (string | null)[],
  ): Promise<Outcome> {
    if (absent.length === 2) {
      const { reason, ...outcome } = doubleNoShowOutcome(timeoutPolicyOf(tournament));
      const resolved = await this.series.resolveSeriesAdministratively({ ...command, outcome, reason });
      if (!resolved.ok)
        return resolved.reason === "presence_changed"
          ? RETRY("retry_presence_changed")
          : TERMINAL("skipped_subject_missing");
      return TERMINAL(
        resolved.value.status === "needs_organizer_decision"
          ? "double_no_show_needs_organizer_decision"
          : "double_no_show_resolved",
      );
    }

    if (!participantAccountIds[absent[0]!]) return TERMINAL("skipped_subject_missing");
    const resolved = await this.series.resolveSeriesAdministratively({
      ...command,
      outcome: { status: "resolved", officialResult: absent[0] === 0 ? "participant1" : "participant0" },
      reason: "administrative_match_loss_no_show",
    });
    if (!resolved.ok)
      return resolved.reason === "presence_changed"
        ? RETRY("retry_presence_changed")
        : TERMINAL("skipped_subject_missing");
    return TERMINAL("match_loss_applied");
  }

  /**
   * Seats that count as present without anybody arriving.
   *
   * A bot never opens a panel, so a seat it occupies would otherwise sit "absent" for ever and
   * hand its human opponent a no-show win at the ten-minute mark. A bot is seated by the server;
   * it is at the table by definition.
   *
   * Returns `undefined` when the match has an empty seat that is NOT a bot — a bye, or a bracket
   * slot nobody has been placed in — because there is no confrontation to penalise anybody over.
   *
   * TODO(C2): the null-account test is a stand-in. `tournament_matches` does not yet carry
   * participant ids, so "a seat with no account, in an event that has bot participants" is the
   * closest available reading of "this seat is a bot". Once the bot-seating work links matches to
   * `tournament_participants`, replace this with a direct read of that participant's `kind` — the
   * seam exists so that change lands in one function.
   */
  private async seatsPresentByDefinition(
    tournament: Tournament,
    participantAccountIds: readonly (string | null)[],
  ): Promise<(0 | 1)[] | undefined> {
    const empty = ([0, 1] as const).filter((seat) => !participantAccountIds[seat]);
    if (empty.length === 0) return [];
    if (empty.length === 2) return undefined;
    return (await this.hasBotParticipants(tournament.id)) ? [...empty] : undefined;
  }

  private async hasBotParticipants(tournamentId: string): Promise<boolean> {
    await this.accounts.ensureReady();
    const found = await this.accounts.pool.query(
      "SELECT 1 FROM tournament_participants WHERE tournament_id=$1 AND kind='bot'",
      [tournamentId],
    );
    return (found.rowCount ?? 0) > 0;
  }

  /**
   * A series parked for a judge is not a quiet outcome. It is logged at error level and left
   * recorded on the row, because nothing downstream will move that confrontation until a person
   * decides it.
   */
  private reportSeries(
    deadline: DeadlineRecord,
    series: SeriesRecord,
    resolved: DeadlineResultCode,
    escalated: DeadlineResultCode,
  ): DeadlineResultCode {
    if (series.status !== "needs_organizer_decision") return resolved;
    logError(
      `[TOURNAMENT_DEADLINE] ${JSON.stringify({
        ...context(deadline),
        seriesId: series.id,
        result: escalated,
        outcome: "needs_organizer_decision",
      })}`,
    );
    return escalated;
  }
}

type AdministrativeInput = {
  tournamentId: string;
  matchId: string;
  winsRequired: number;
  seriesDurationMs: number | null;
  expectedAbsentSeats: readonly (0 | 1)[];
  alwaysPresentSeats: readonly (0 | 1)[];
  now: number;
};

const CLOSED_SERIES: readonly SeriesStatus[] = ["resolved", "needs_organizer_decision"];

/** The first rung of the ladder: the game loss, or the match loss for a ruleset without one. */
function firstRung(rules: TournamentRules, base: number): { kind: DeadlineKind; dueAt: number } {
  return rules.attendance.gameLossAtMs === null
    ? { kind: "join_match_loss", dueAt: base + rules.attendance.matchLossAtMs }
    : { kind: "join_game_loss", dueAt: base + rules.attendance.gameLossAtMs };
}

/**
 * Which timeout rules govern this event's confrontations.
 *
 * Read off the tournament's structure, which is as far as this slice can see: distinguishing a Top
 * Cut round from the Swiss rounds that preceded it needs the phase layer, which lands with Top Cut
 * itself. A single-elimination event is elimination throughout, and that is the case where getting
 * it wrong would matter most — it is the one that must never be settled by a coin.
 */
function timeoutPolicyOf(tournament: Tournament): SeriesTimeoutPolicy {
  if (tournament.structure === "single_elimination" || !tournament.rules) return { kind: "elimination" };
  return { kind: "swiss", onTie: tournament.rules.timeout.swiss };
}

/**
 * Nobody arrived at all, ten minutes in.
 *
 * In Swiss this is the tie rule applied to an empty confrontation: a draw, or a double loss where
 * the ruleset says so. In elimination there is no such rule — somebody has to advance and neither
 * of them can — so it escalates rather than inventing a bracket. That is the same refusal the
 * elimination timeout makes, for the same reason.
 */
function doubleNoShowOutcome(policy: SeriesTimeoutPolicy): {
  status: SeriesStatus;
  officialResult: SeriesOfficialResult | null;
  reason: string;
} {
  if (policy.kind === "elimination")
    return {
      status: "needs_organizer_decision",
      officialResult: null,
      reason: "double_no_show_needs_organizer_decision",
    };
  if (policy.onTie === "double_loss")
    return { status: "resolved", officialResult: "double_loss", reason: "double_no_show_double_loss" };
  return { status: "resolved", officialResult: "draw", reason: "double_no_show_draw" };
}

/**
 * The clock an administratively created series runs on, chosen by the match's PHASE.
 *
 * A confrontation that has to be created by a deadline — a double no-show has no presence to have
 * started one — must run under the same clock the players would have started it under. Reading the
 * phase is what makes a Top Cut match 55 minutes and the final untimed instead of everything
 * silently taking the Swiss round clock.
 *
 * A match that cannot be read at all falls back to the base round duration: the caller is about to
 * refuse the row as a missing subject anyway, and inventing an untimed series in the meantime would
 * be the worse guess.
 */
async function seriesDurationOf(db: Queryable, rules: TournamentRules, matchId: string): Promise<number | null> {
  const clock = await matchClockContext(db, matchId);
  return clock ? seriesDurationFor(rules, clock) : rules.match.swissDurationMs;
}

function context(deadline: DeadlineRecord): Record<string, unknown> {
  return {
    deadlineId: deadline.id,
    kind: deadline.kind,
    tournamentId: deadline.tournamentId,
    subjectId: deadline.subjectId,
    dueAt: deadline.dueAt,
  };
}
