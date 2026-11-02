import { randomUUID } from "node:crypto";
import type { Queryable } from "../../db/migrator.js";
import { logTournamentEvent } from "./structuredLog.js";

export type TournamentActorKind = "organizer" | "participant" | "system" | "scheduler";
export type TournamentSubjectKind = "tournament" | "phase" | "round" | "match" | "series" | "participant";

/**
 * Every command that can appear in the trail. A union rather than a free string so a new command
 * has to be declared here — the trail's vocabulary is part of the contract a replay depends on.
 */
export type TournamentCommandName =
  // Organizer arbitration (this slice).
  | "decide_series"
  | "swap_pairings"
  | "concede_match"
  | "disqualify"
  | "cancel_tournament"
  | "round_start_mode_changed"
  | "correct_result"
  // Automatic decisions. Recorded because the plan's acceptance criterion is that EVERY action,
  // automatic or not, is reconstructible from the ledger — not only the ones a human typed.
  //
  // The ORDINARY ones are here too, not just the exceptional ones. A trail holding only no-shows and
  // judge rulings can say why an unusual result happened but cannot rebuild the tournament: the
  // rounds nobody disputed are most of it, and a reconstruction missing them is a narration, not a
  // replay. Between them these five cover every state transition an event goes through.
  | "administrative_loss"
  | "deadline_resolved"
  | "bot_fill"
  | "round_published"
  | "round_closed"
  // The Swiss-to-cut transition. Without it a replay can see the cut's rounds being published and
  // played but cannot say a cut was DRAWN, nor from which order — and the seeding is the single
  // most disputed decision in an event, because it is what a placing is worth.
  | "top_cut_started"
  | "series_resolved"
  | "bracket_advanced"
  | "tournament_finished";

export type TournamentEventInput = {
  tournamentId: string;
  actorKind: TournamentActorKind;
  /** Account id for a human actor; the literal "system" or "scheduler" for a machine one. */
  actorId: string;
  command: TournamentCommandName;
  /** Idempotency key. A retried command with the same id appends nothing and reports `replayed`. */
  commandId: string;
  reason: string;
  reasonCode: string;
  subjectKind?: TournamentSubjectKind;
  subjectId?: string | null;
  phaseId?: string | null;
  roundId?: string | null;
  matchId?: string | null;
  seriesId?: string | null;
  participantId?: string | null;
  before?: unknown;
  after?: unknown;
  now?: number;
};

export type TournamentEvent = {
  id: string;
  sequence: number;
  tournamentId: string;
  actorKind: TournamentActorKind;
  actorId: string;
  command: TournamentCommandName;
  commandId: string;
  reason: string;
  reasonCode: string;
  subjectKind: TournamentSubjectKind | null;
  subjectId: string | null;
  phaseId: string | null;
  roundId: string | null;
  matchId: string | null;
  seriesId: string | null;
  participantId: string | null;
  before: unknown;
  after: unknown;
  createdAt: number;
};

export type AppendResult = { kind: "appended"; event: TournamentEvent } | { kind: "replayed"; event: TournamentEvent };

export class MissingReasonError extends Error {}

/**
 * Appends one row to the audit ledger, inside the caller's transaction.
 *
 * It takes a `Queryable` rather than a pool on purpose: the event must commit with the change it
 * describes or not at all. An event written on its own connection would survive a rolled-back
 * command and describe something that never happened, which is strictly worse than no trail.
 *
 * Idempotent on `commandId`: a retried command finds its own row and gets it back as `replayed`,
 * so the caller can skip re-applying the change instead of applying it twice.
 */
export async function appendTournamentEvent(db: Queryable, input: TournamentEventInput): Promise<AppendResult> {
  const reason = input.reason.trim();
  if (!reason) throw new MissingReasonError(`${input.command} requires a reason`);

  // Take the tournament's allocator lock FIRST, then look for a replay, then consume a number. That
  // order is what makes the whole append race-free without a single retry: no other writer for this
  // tournament can be between the check and the insert, so the unique violation the old retry loop
  // existed to absorb is now unreachable — which matters, because on real Postgres a 23505 aborts
  // the caller's transaction and no re-read is possible afterwards.
  //
  // Reserving the number only AFTER the replay check is what keeps the sequence gapless: a replayed
  // command must not burn a slot, or the trail would read as if an event had been deleted.
  await lockSequence(db, input.tournamentId);
  const existing = await findEventByCommandId(db, input.tournamentId, input.commandId);
  if (existing) return { kind: "replayed", event: existing };

  const event: TournamentEvent = {
    id: randomUUID(),
    sequence: await consumeSequence(db, input.tournamentId),
    tournamentId: input.tournamentId,
    actorKind: input.actorKind,
    actorId: input.actorId,
    command: input.command,
    commandId: input.commandId,
    reason,
    reasonCode: input.reasonCode,
    subjectKind: input.subjectKind ?? null,
    subjectId: input.subjectId ?? null,
    phaseId: input.phaseId ?? null,
    roundId: input.roundId ?? null,
    matchId: input.matchId ?? null,
    seriesId: input.seriesId ?? null,
    participantId: input.participantId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    createdAt: input.now ?? Date.now(),
  };
  await db.query(
    `INSERT INTO tournament_events
       (id, tournament_id, sequence, actor_kind, actor_id, command, command_id, subject_kind, subject_id,
        phase_id, round_id, match_id, series_id, participant_id, reason, reason_code, before_state, after_state, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
    [
      event.id,
      event.tournamentId,
      event.sequence,
      event.actorKind,
      event.actorId,
      event.command,
      event.commandId,
      event.subjectKind,
      event.subjectId,
      event.phaseId,
      event.roundId,
      event.matchId,
      event.seriesId,
      event.participantId,
      event.reason,
      event.reasonCode,
      JSON.stringify(event.before ?? null),
      JSON.stringify(event.after ?? null),
      event.createdAt,
    ],
  );
  logTournamentEvent({
    event: event.command,
    outcome: "applied",
    tournamentId: event.tournamentId,
    actorKind: event.actorKind,
    actorId: event.actorId,
    commandId: event.commandId,
    reasonCode: event.reasonCode,
    sequence: event.sequence,
    phaseId: event.phaseId,
    roundId: event.roundId,
    matchId: event.matchId,
    seriesId: event.seriesId,
    participantId: event.participantId,
  });
  return { kind: "appended", event };
}

/** The whole trail for one tournament, in the order it happened. */
export async function readTournamentEvents(db: Queryable, tournamentId: string): Promise<TournamentEvent[]> {
  const result = await db.query<EventRow>(
    `SELECT * FROM tournament_events WHERE tournament_id=$1 ORDER BY sequence ASC`,
    [tournamentId],
  );
  return result.rows.map(toEvent);
}

type EventRow = {
  id: string;
  tournament_id: string;
  sequence: number | string;
  actor_kind: TournamentActorKind;
  actor_id: string;
  command: TournamentCommandName;
  command_id: string;
  subject_kind: TournamentSubjectKind | null;
  subject_id: string | null;
  phase_id: string | null;
  round_id: string | null;
  match_id: string | null;
  series_id: string | null;
  participant_id: string | null;
  reason: string;
  reason_code: string;
  before_state: unknown;
  after_state: unknown;
  created_at: number | string;
};

function toEvent(row: EventRow): TournamentEvent {
  return {
    id: row.id,
    sequence: Number(row.sequence),
    tournamentId: row.tournament_id,
    actorKind: row.actor_kind,
    actorId: row.actor_id,
    command: row.command,
    commandId: row.command_id,
    reason: row.reason,
    reasonCode: row.reason_code,
    subjectKind: row.subject_kind,
    subjectId: row.subject_id,
    phaseId: row.phase_id,
    roundId: row.round_id,
    matchId: row.match_id,
    seriesId: row.series_id,
    participantId: row.participant_id,
    before: parseState(row.before_state),
    after: parseState(row.after_state),
    createdAt: Number(row.created_at),
  };
}

// pg returns jsonb already parsed; pg-mem can hand back the raw string it was given.
function parseState(value: unknown): unknown {
  if (typeof value !== "string") return value ?? null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

/**
 * One command's event, by its idempotency key. A point lookup on `UNIQUE (tournament_id,
 * command_id)` — the caller must never scan the trail to answer this, since a long-running
 * tournament's trail grows without bound while this stays one index probe.
 */
export async function findEventByCommandId(
  db: Queryable,
  tournamentId: string,
  commandId: string,
): Promise<TournamentEvent | undefined> {
  const result = await db.query<EventRow>("SELECT * FROM tournament_events WHERE tournament_id=$1 AND command_id=$2", [
    tournamentId,
    commandId,
  ]);
  const row = result.rows[0];
  return row ? toEvent(row) : undefined;
}

/** Creates the tournament's allocator row if this is its first event, and locks it either way. */
async function lockSequence(db: Queryable, tournamentId: string): Promise<void> {
  await db.query(
    "INSERT INTO tournament_event_sequences (tournament_id, next_sequence) VALUES ($1,1) ON CONFLICT DO NOTHING",
    [tournamentId],
  );
  await db.query("SELECT next_sequence FROM tournament_event_sequences WHERE tournament_id=$1 FOR UPDATE", [
    tournamentId,
  ]);
}

/** Takes the next number and advances the allocator. Only ever called under {@link lockSequence}. */
async function consumeSequence(db: Queryable, tournamentId: string): Promise<number> {
  const row = (
    await db.query<{ next_sequence: number | string }>(
      "UPDATE tournament_event_sequences SET next_sequence = next_sequence + 1 WHERE tournament_id=$1 RETURNING next_sequence",
      [tournamentId],
    )
  ).rows[0];
  if (!row) throw new Error(`no audit sequence allocator for tournament ${tournamentId}`);
  // RETURNING gives the value AFTER the increment, so the number this call owns is one below it.
  return Number(row.next_sequence) - 1;
}
