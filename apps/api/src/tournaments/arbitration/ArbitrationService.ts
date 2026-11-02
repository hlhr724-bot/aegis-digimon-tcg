import type { ParticipantRecord, ParticipantResult } from "#api/tournaments/participants/ParticipantStore";
import { swapTournamentPairings } from "#api/tournaments/pairing/swapTournamentPairings";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { AccountStore, Tournament } from "../../accounts/AccountStore.js";
import {
  appendTournamentEvent,
  findEventByCommandId,
  logTournamentEvent,
  readTournamentEvents,
  type TournamentEvent,
} from "../audit/index.js";
import type { EliminationStore } from "../elimination/index.js";
import type { ParticipantStore } from "../participants/index.js";
import type { SeriesOfficialResult, SeriesRecord, SeriesStore } from "../series/index.js";
import type { SwissProgram } from "../swiss/index.js";

export type ArbitrationFailure =
  | "tournament_not_found"
  | "not_organizer"
  | "reason_required"
  | "series_not_found"
  | "match_not_found"
  | "participant_not_found"
  | "not_a_participant"
  | "series_already_resolved"
  | "series_not_resolved"
  | "round_closed"
  | "bracket_advanced"
  | "tournament_finished"
  | "pairings_not_editable";

/**
 * `replayed` and `alreadyApplied` are two different ways for a command to change nothing, and the
 * caller wants to tell them apart:
 *
 *  - **replayed** — THIS command ran before, recognised by its `commandId`. `event` is the original.
 *  - **alreadyApplied** — a DIFFERENT command already put the subject in the state this one asks
 *    for: an organizer cancelling an event that is already cancelled, or disqualifying an entrant
 *    already thrown out. There is no event, because nothing changed and an append-only trail must
 *    not record a change that did not happen.
 *
 * Both answer 200. A retry that omitted its `commandId` is still a retry, and an idempotent command
 * that finds its work already done has succeeded; answering 409 would make honest retries look like
 * failures, which is the opposite of what idempotence is for.
 */
export type ArbitrationResult<T> =
  | {
      ok: true;
      /** Absent when nothing changed: the change belongs to the earlier command, not to this call. */
      value: T | undefined;
      event: TournamentEvent | undefined;
      replayed: boolean;
      alreadyApplied: boolean;
    }
  | { ok: false; reason: ArbitrationFailure };

/** How an organizer settles a confrontation the server could not settle for itself. */
export type SeriesDecision =
  | { kind: "winner_account"; accountId: string }
  | { kind: "winner_participant"; participantId: string }
  | { kind: "draw" }
  | { kind: "double_loss" };

/** What every arbitration command carries, whatever it decides. */
type CommandEnvelope = {
  tournamentId: string;
  actorAccountId: string;
  reason: string;
  /**
   * The caller's idempotency key. Two requests bearing the same id are ONE command: the second
   * finds the first's audit row, changes nothing, and reports the original outcome. A caller that
   * omits it gets a fresh id, which means a retried request without one really is a second command.
   */
  commandId?: string;
  now?: number;
};

/**
 * The organizer's commands, and the only path by which a human overrules the server.
 *
 * Three properties hold for every command here, and each is load-bearing:
 *
 *  - **Authorized.** The organizer is the tournament's creator or any judge (`ParticipantStore.canArbitrate`).
 *    There is no judge role table yet and inventing one is a bigger design than this slice; the
 *    check lives in one place so adding roles later is a change to one function.
 *  - **Audited, transactionally.** The `tournament_events` row is written by the same transaction
 *    as the change, through the `audit` callbacks the stores accept. A trail that could disagree
 *    with the state it describes is worse than none, so the two commit together or neither does.
 *  - **Idempotent on `commandId`.** The audit row's `UNIQUE (tournament_id, command_id)` is the
 *    idempotency key for the whole command, not just for its trail: a replay is detected before the
 *    change is applied a second time.
 *
 * The reason is mandatory everywhere, checked here before anything is read and again by the ledger.
 */
export class ArbitrationService {
  async dropParticipant(input: {
    tournamentId: string;
    accountId: string;
    now?: number;
  }): Promise<ParticipantResult<ParticipantRecord>> {
    const now = input.now ?? Date.now();
    const dropped = await this.participants.drop({ ...input, now });
    if (!dropped.ok && dropped.reason !== "already_dropped") return dropped;
    const participant = dropped.ok
      ? dropped.value
      : (await this.participants.participants(input.tournamentId)).find((entry) => entry.accountId === input.accountId);
    if (!participant || participant.status !== "dropped") return { ok: false, reason: "already_dropped" };
    for (const match of await this.openMatchesOf(input.tournamentId, participant.id, input.accountId)) {
      const resolved = await this.concedeMatch({
        tournamentId: input.tournamentId,
        matchId: match.matchId,
        actorAccountId: input.accountId,
        byAccountId: input.accountId,
        commandId: `drop:${participant.id}:${match.matchId}`,
        reason: "Participant withdrew from the tournament",
        now,
      });
      if (!resolved.ok && resolved.reason !== "series_already_resolved") {
        throw new Error(`Unable to resolve withdrawn participant's match: ${resolved.reason}`);
      }
    }
    await this.swiss.sweepOpenTournaments(now);
    return { ok: true, value: participant };
  }

  async swapPairings(
    input: CommandEnvelope & {
      firstMatchId: string;
      firstSeat: 0 | 1;
      secondMatchId: string;
      secondSeat: 0 | 1;
    },
  ): Promise<ArbitrationResult<void>> {
    return swapTournamentPairings({ accounts: this.accounts, ...input });
  }

  constructor(
    private readonly accounts: AccountStore,
    private readonly participants: ParticipantStore,
    private readonly series: SeriesStore,
    private readonly swiss: SwissProgram,
    private readonly elimination: EliminationStore,
  ) {}

  /** The single authorization question every command asks. Exposed so the routes ask the same one. */
  async canArbitrate(tournamentId: string, accountId: string): Promise<boolean> {
    return this.participants.canArbitrate(tournamentId, accountId);
  }

  /** Every event of one tournament, oldest first. Organizer-only at the route; open here. */
  async trail(tournamentId: string): Promise<TournamentEvent[]> {
    await this.accounts.ensureReady();
    return readTournamentEvents(this.accounts.pool, tournamentId);
  }

  /**
   * Settles a confrontation the server parked or could not finish.
   *
   * This is the way out of `needs_organizer_decision` — an elimination confrontation tied on its
   * clock, or a double no-show in a cut — and it is also how a still-running confrontation is ended
   * by judgement (a match played out away from the table, a ruling on a dispute). It flows through
   * `SeriesStore.overrideResolution`, which announces exactly as a played-out result does, so the
   * round closes and the bracket advances through the normal path rather than through a second one
   * that would have to be kept in step with it.
   *
   * Refuses a series that is already `resolved`; changing one of those is {@link correctResult} and
   * is far more constrained.
   */
  async decideSeries(
    input: CommandEnvelope & { seriesId: string; decision: SeriesDecision },
  ): Promise<ArbitrationResult<SeriesRecord>> {
    return this.run(input, "decide_series", async (context) => {
      const series = await this.series.series(input.seriesId);
      if (!series || series.tournamentId !== input.tournamentId) return { ok: false, reason: "series_not_found" };
      const officialResult = officialResultOf(input.decision, series);
      if (!officialResult) return { ok: false, reason: "not_a_participant" };
      return this.applyOverride(context, series.matchId, "decide", officialResult, reasonCodeOf(input.decision), {
        seriesId: series.id,
      });
    });
  }

  /**
   * A player gives the confrontation to their opponent.
   *
   * Callable by the organizer OR by the conceding player themselves — a concession is the one
   * arbitration outcome a participant is entitled to ask for, since it can only ever cost them the
   * match. It is recorded as a match loss for the conceder, whatever the score on the board, which
   * is what "concedes the match" means; conceding a single game is a room-level action and not this.
   */
  async concedeMatch(
    input: CommandEnvelope & { matchId: string; byAccountId: string },
  ): Promise<ArbitrationResult<SeriesRecord>> {
    return this.run(
      input,
      "concede_match",
      async (context) => {
        const seats = await this.matchSeats(input.tournamentId, input.matchId);
        if (!seats) return { ok: false, reason: "match_not_found" };
        const seat = seats.accountIds.indexOf(input.byAccountId);
        if (seat !== 0 && seat !== 1) return { ok: false, reason: "not_a_participant" };
        const winner: SeriesOfficialResult = seat === 0 ? "participant1" : "participant0";
        return this.applyOverride(context, input.matchId, "decide", winner, "concession", {});
      },
      // The conceder is allowed to concede for themselves; anyone else must be the organizer.
      input.actorAccountId === input.byAccountId ? "participant" : "organizer",
    );
  }

  /**
   * Throws a participant out, and settles what they leave behind.
   *
   * Three things happen, in this order and for this reason: the participant's status becomes
   * `disqualified`, which is what every future pairing already reads; each of their still-open
   * confrontations is awarded to the opponent, because a round cannot close around an entrant who
   * is gone; and the Swiss sweep is nudged so a round whose last open confrontation this was
   * actually closes rather than waiting for the next tick.
   *
   * The result ledger is not touched. Results already recorded are facts, and their opponents'
   * tiebreakers are computed from them — a disqualification removes a player from the future, never
   * from the past. That is the "compensating events only" rule the plan states, applied to a DQ.
   */
  async disqualify(
    input: CommandEnvelope & { participantId: string },
  ): Promise<ArbitrationResult<{ participantId: string; resolvedMatchIds: string[] }>> {
    return this.run(input, "disqualify", async (context) => {
      const disqualified = await this.participants.disqualify({
        tournamentId: input.tournamentId,
        participantId: input.participantId,
        now: context.now,
        audit: async (client, before, after) => {
          await context.write(client, {
            subjectKind: "participant",
            subjectId: input.participantId,
            participantId: input.participantId,
            reasonCode: "disqualified",
            before: { status: before.status },
            after: { status: after.status },
          });
        },
      });
      if (!disqualified.ok) return { ok: false, reason: "participant_not_found" };

      const resolvedMatchIds: string[] = [];
      // Run the awards even for an entrant already disqualified: the status can have been set by
      // the lifecycle rather than by a command (an illegal deck at check-in becomes `disqualified`
      // there), and that path leaves any open confrontation for somebody to settle.
      for (const open of await this.openMatchesOf(
        input.tournamentId,
        input.participantId,
        disqualified.value.participant.accountId,
      )) {
        // Each awarded confrontation is its OWN event with its own derived command id. One event
        // saying "disqualified, and by the way three matches moved" would not replay; three rows
        // each naming their series do, and the derived id keeps them idempotent per match.
        const applied = await this.applyOverride(
          { ...context, commandId: derivedCommandId(context.commandId, open.matchId) },
          open.matchId,
          "decide",
          open.seat === 0 ? "participant1" : "participant0",
          "opponent_disqualified",
          { seriesId: open.seriesId, participantId: input.participantId },
        );
        if (applied.ok) resolvedMatchIds.push(open.matchId);
      }
      await this.swiss.sweepOpenTournaments(context.now);
      return {
        ok: true,
        value: { participantId: input.participantId, resolvedMatchIds },
        alreadyApplied: disqualified.value.alreadyApplied && resolvedMatchIds.length === 0,
      };
    });
  }

  /** Ends an event that will not run, with the reason finally persisted rather than merely echoed. */
  async cancelTournament(input: CommandEnvelope): Promise<ArbitrationResult<{ status: "cancelled" }>> {
    return this.run(input, "cancel_tournament", async (context) => {
      const cancelled = await this.participants.cancelTournament({
        tournamentId: input.tournamentId,
        reason: input.reason,
        now: context.now,
        audit: async (client, before) => {
          await context.write(client, {
            subjectKind: "tournament",
            subjectId: input.tournamentId,
            reasonCode: "cancelled",
            before: { status: before.status },
            after: { status: "cancelled" },
          });
        },
      });
      if (!cancelled.ok)
        return {
          ok: false,
          reason: cancelled.reason === "tournament_not_found" ? "tournament_not_found" : "tournament_finished",
        };
      return { ok: true, value: { status: "cancelled" as const }, alreadyApplied: cancelled.value.alreadyApplied };
    });
  }

  /**
   * Replaces the official result of a confrontation that was already decided.
   *
   * **What is correctable, and why nothing more is.** A correction is only accepted while the
   * match's round is still open. Closing a round writes one `tournament_result_ledger` row per
   * participant, under a UNIQUE index on `(tournament, participant, round)`, and the pairings of
   * every later round are computed from those rows. So once the round has closed there is no
   * compensating event available — the only way to express the correction would be to REWRITE the
   * ledger rows the next round was already built on, which is precisely the mutation the plan
   * forbids ("no change that invalidates a round already published") and the one thing that would
   * make the trail unreplayable.
   *
   * Concretely:
   *
   * | Situation | Correctable | Refusal |
   * |---|---|---|
   * | Swiss match, round still open | yes | — |
   * | Swiss match, round closed | no | `round_closed` |
   * | Elimination match, bracket already advanced the winner | no | `bracket_advanced` |
   * | Match with no result yet | no — use {@link decideSeries} | `series_not_resolved` |
   * | Tournament already finished | no | `tournament_finished` |
   *
   * The remedy for an uncorrectable mistake is the honest one: it stays on the record, and the
   * organizer's options are a compensating decision in a later round or cancelling the event. Both
   * are visible in the trail; a silent rewrite would not be.
   */
  async correctResult(
    input: CommandEnvelope & { matchId: string; decision: SeriesDecision; correctedWins?: [number, number] },
  ): Promise<ArbitrationResult<SeriesRecord>> {
    return this.run(input, "correct_result", async (context) => {
      if (!(await this.matchSeats(input.tournamentId, input.matchId))) return { ok: false, reason: "match_not_found" };
      const series = await this.series.seriesForMatch(input.matchId);
      // A confrontation with no series at all has no result to correct; that is `decideSeries`.
      if (!series || series.status !== "resolved") return { ok: false, reason: "series_not_resolved" };
      if (context.tournament.status === "finished") return { ok: false, reason: "tournament_finished" };

      const placement = await this.matchPlacement(input.matchId);
      if (placement.roundStatus === "closed") return { ok: false, reason: "round_closed" };
      // No round at all means the legacy/elimination bracket owns this match, and the bracket
      // advances the winner the instant the series resolves. There is no state in which its result
      // is both settled and not yet consumed, so a correction there is always too late.
      if (placement.roundStatus === null && placement.matchStatus === "finished")
        return { ok: false, reason: "bracket_advanced" };

      const officialResult = officialResultOf(input.decision, series);
      if (!officialResult) return { ok: false, reason: "not_a_participant" };
      return this.applyOverride(context, input.matchId, "correct", officialResult, "result_corrected", {
        seriesId: series.id,
        roundId: placement.roundId,
        correctedWins: input.correctedWins,
      });
    });
  }

  // ---------------------------------------------------------------------------------------------

  private async applyOverride(
    context: CommandContext,
    matchId: string,
    mode: "decide" | "correct",
    officialResult: SeriesOfficialResult,
    reasonCode: string,
    ids: {
      seriesId?: string | null;
      roundId?: string | null;
      participantId?: string | null;
      correctedWins?: [number, number];
    },
  ): Promise<{ ok: true; value: SeriesRecord } | { ok: false; reason: ArbitrationFailure }> {
    const rules = context.tournament.rules?.match;
    const applied = await this.series.overrideResolution({
      tournamentId: context.tournamentId,
      matchId,
      mode,
      outcome: { officialResult },
      reason: context.reason,
      winsRequired: rules?.winsRequired ?? (context.tournament.bestOf === 3 ? 2 : 1),
      seriesDurationMs: seriesDurationMs(context.tournament),
      commandId: context.commandId,
      now: context.now,
      correctedWins: ids.correctedWins,
      audit: async (client, before, after) => {
        await context.write(client, {
          commandId: context.commandId,
          subjectKind: "series",
          subjectId: after.id,
          seriesId: after.id,
          matchId,
          roundId: ids.roundId ?? null,
          participantId: ids.participantId ?? null,
          reasonCode,
          before: { status: before.status, officialResult: before.officialResult, wins: before.wins },
          after: { status: after.status, officialResult: after.officialResult, wins: after.wins },
        });
      },
    });
    if (applied.ok) {
      // The bracket listens for resolutions in-process; a nudge here is what makes an arbitrated
      // elimination match advance even when this instance is not the one holding that listener.
      await this.elimination.onSeriesResolvedById(applied.value.id).catch(() => undefined);
      return { ok: true, value: applied.value };
    }
    return {
      ok: false,
      reason:
        applied.reason === "match_not_found"
          ? "match_not_found"
          : applied.reason === "series_already_resolved"
            ? "series_already_resolved"
            : "series_not_found",
    };
  }

  /**
   * The shared spine: authorize, demand a reason, detect a replay, run the body, log the outcome.
   *
   * The replay check reads the trail BEFORE the body runs, so a retried command never re-applies
   * its change — the ledger's `UNIQUE (tournament_id, command_id)` is the backstop for the race,
   * this is the fast path that keeps a double-click from double-deciding.
   */
  private async run<T>(
    input: CommandEnvelope,
    command: Parameters<typeof appendTournamentEvent>[1]["command"],
    body: (
      context: CommandContext,
    ) => Promise<{ ok: true; value: T; alreadyApplied?: boolean } | { ok: false; reason: ArbitrationFailure }>,
    actorKind: "organizer" | "participant" = "organizer",
  ): Promise<ArbitrationResult<T>> {
    const now = input.now ?? Date.now();
    const commandId = input.commandId ?? randomUUID();
    const reason = input.reason.trim();
    const base = { tournamentId: input.tournamentId, commandId, actorId: input.actorAccountId, actorKind };
    if (!reason) return this.refuse(base, command, "reason_required");

    await this.accounts.ensureReady();
    const tournament = await this.accounts.tournament(input.tournamentId);
    if (!tournament) return this.refuse(base, command, "tournament_not_found");
    if (actorKind === "organizer" && !(await this.participants.canArbitrate(input.tournamentId, input.actorAccountId)))
      return this.refuse(base, command, "not_organizer");

    // A point lookup on the trail's idempotency index, not a scan of it: a long event's trail grows
    // without bound while this stays one index probe.
    const replayed = await findEventByCommandId(this.accounts.pool, input.tournamentId, commandId);
    if (replayed) {
      logTournamentEvent({
        ...base,
        event: command,
        outcome: "replayed",
        reasonCode: replayed.reasonCode,
        sequence: replayed.sequence,
      });
      return { ok: true, value: undefined, event: replayed, replayed: true, alreadyApplied: false };
    }

    let written: TournamentEvent | undefined;
    const context: CommandContext = {
      tournamentId: input.tournamentId,
      tournament,
      reason,
      commandId,
      now,
      write: async (client, fields) => {
        const appended = await appendTournamentEvent(client, {
          tournamentId: input.tournamentId,
          actorKind,
          actorId: input.actorAccountId,
          command,
          commandId,
          reason,
          now,
          ...fields,
        });
        written ??= appended.event;
      },
    };
    const result = await body(context);
    if (!result.ok) return this.refuse(base, command, result.reason);
    if (!written) {
      // No event means no change. That is legitimate exactly when the body says so: the subject was
      // already in the state this command asks for, reached by some earlier command or by the
      // lifecycle itself. Anything else is a body that mutated without auditing, which is the one
      // failure this class exists to make impossible — so it stays an error.
      if (!result.alreadyApplied)
        throw new Error(`arbitration command ${command} changed state without writing an audit event`);
      logTournamentEvent({ ...base, event: command, outcome: "replayed", detail: "already_applied" });
      return { ok: true, value: result.value, event: undefined, replayed: false, alreadyApplied: true };
    }
    return { ok: true, value: result.value, event: written, replayed: false, alreadyApplied: false };
  }

  private refuse(
    base: { tournamentId: string; commandId: string; actorId: string; actorKind: "organizer" | "participant" },
    command: string,
    reason: ArbitrationFailure,
  ): { ok: false; reason: ArbitrationFailure } {
    logTournamentEvent({ ...base, event: command, outcome: "refused", detail: reason });
    return { ok: false, reason };
  }

  /** Where a match sits: its round's status, or null when it belongs to no round at all. */
  private async matchPlacement(
    matchId: string,
  ): Promise<{ roundId: string | null; roundStatus: string | null; matchStatus: string | null }> {
    const match = (
      await this.accounts.pool.query<{ round_id: string | null; status: string }>(
        "SELECT round_id, status FROM tournament_matches WHERE id=$1",
        [matchId],
      )
    ).rows[0];
    if (!match?.round_id) return { roundId: null, roundStatus: null, matchStatus: match?.status ?? null };
    const round = (
      await this.accounts.pool.query<{ status: string }>("SELECT status FROM tournament_rounds WHERE id=$1", [
        match.round_id,
      ])
    ).rows[0];
    return { roundId: match.round_id, roundStatus: round?.status ?? null, matchStatus: match.status };
  }

  private async matchSeats(
    tournamentId: string,
    matchId: string,
  ): Promise<{ accountIds: (string | null)[]; participantIds: (string | null)[] } | undefined> {
    const row = (
      await this.accounts.pool.query<MatchSeatRow>(
        `SELECT player0_account_id, player1_account_id, player0_participant_id, player1_participant_id, status
           FROM tournament_matches WHERE id=$1 AND tournament_id=$2`,
        [matchId, tournamentId],
      )
    ).rows[0];
    if (!row) return undefined;
    return {
      accountIds: [row.player0_account_id, row.player1_account_id],
      participantIds: [row.player0_participant_id, row.player1_participant_id],
    };
  }

  /** The confrontations a departing participant leaves unfinished, and which seat they occupy. */
  private async openMatchesOf(
    tournamentId: string,
    participantId: string,
    accountId: string | null,
  ): Promise<{ matchId: string; seat: 0 | 1; seriesId: string | null }[]> {
    const rows = (
      await this.accounts.pool.query<MatchSeatRow & { id: string }>(
        `SELECT id, player0_account_id, player1_account_id, player0_participant_id, player1_participant_id, status
           FROM tournament_matches WHERE tournament_id=$1`,
        [tournamentId],
      )
    ).rows;
    const open: { matchId: string; seat: 0 | 1; seriesId: string | null }[] = [];
    for (const row of rows) {
      if (row.status === "bye" || row.status === "finished") continue;
      const seat =
        row.player0_participant_id === participantId || (accountId !== null && row.player0_account_id === accountId)
          ? 0
          : row.player1_participant_id === participantId || (accountId !== null && row.player1_account_id === accountId)
            ? 1
            : undefined;
      if (seat === undefined) continue;
      // A seat with nobody opposite is a bye in all but name; there is nobody to award it to.
      if (
        (seat === 0
          ? (row.player1_account_id ?? row.player1_participant_id)
          : (row.player0_account_id ?? row.player0_participant_id)) === null
      )
        continue;
      const series = await this.series.seriesForMatch(row.id);
      if (series?.status === "resolved") continue;
      open.push({ matchId: row.id, seat, seriesId: series?.id ?? null });
    }
    return open;
  }
}

type MatchSeatRow = {
  player0_account_id: string | null;
  player1_account_id: string | null;
  player0_participant_id: string | null;
  player1_participant_id: string | null;
  status: string;
};

type CommandContext = {
  tournamentId: string;
  tournament: Tournament;
  reason: string;
  commandId: string;
  now: number;
  write: (
    client: PoolClient,
    fields: {
      /** Overrides the envelope's id, so one command's several changes each replay on their own. */
      commandId?: string;
      subjectKind: "tournament" | "phase" | "round" | "match" | "series" | "participant";
      subjectId?: string | null;
      phaseId?: string | null;
      roundId?: string | null;
      matchId?: string | null;
      seriesId?: string | null;
      participantId?: string | null;
      reasonCode: string;
      before?: unknown;
      after?: unknown;
    },
  ) => Promise<void>;
};

/** One command's id for one of its several subjects. Stable, so the whole command replays as a unit. */
function derivedCommandId(commandId: string, subjectId: string): string {
  return `${commandId}:${subjectId}`;
}

function officialResultOf(decision: SeriesDecision, series: SeriesRecord): SeriesOfficialResult | undefined {
  if (decision.kind === "draw") return "draw";
  if (decision.kind === "double_loss") return "double_loss";
  const seat =
    decision.kind === "winner_account"
      ? series.participantAccountIds.indexOf(decision.accountId)
      : series.participantIds.indexOf(decision.participantId);
  if (seat !== 0 && seat !== 1) return undefined;
  return seat === 0 ? "participant0" : "participant1";
}

function reasonCodeOf(decision: SeriesDecision): string {
  return decision.kind === "draw"
    ? "organizer_draw"
    : decision.kind === "double_loss"
      ? "organizer_double_loss"
      : "organizer_winner";
}

/**
 * The confrontation clock the tournament's frozen ruleset imposes, chosen by structure. Mirrors the
 * HTTP layer's reading deliberately: an arbitration decision that has to CREATE the series (a double
 * no-show never started one) must give it the same clock the normal path would have.
 */
function seriesDurationMs(tournament: Tournament): number | null {
  const match = tournament.rules?.match;
  if (!match) return null;
  return tournament.structure === "swiss" ? match.swissDurationMs : (match.topCutDurationMs ?? match.finalDurationMs);
}
