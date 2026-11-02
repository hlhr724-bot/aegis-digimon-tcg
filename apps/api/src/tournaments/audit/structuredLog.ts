import { log } from "../../logger.js";

/**
 * The grep-able half of the audit trail.
 *
 * The implementation plan asks for structured logs carrying `tournamentId`, `phaseId`, `roundId`,
 * `matchId`, `seriesId`, `commandId` and `reasonCode`, and explicitly no decklists and no tokens.
 * One JSON object per line is the whole design: counters ("no-shows this hour", "deadlines late")
 * are derived by grepping the stream, so nothing here depends on a metrics backend existing, and
 * adding one later means pointing a collector at the same lines.
 *
 * Only the fields below are ever emitted. That is the privacy rule expressed as a type rather than
 * as a review comment: there is no `extra` bag a caller could put a decklist in.
 */
export type TournamentLogFields = {
  event: string;
  outcome: "applied" | "replayed" | "refused" | "failed";
  tournamentId: string;
  actorKind?: "organizer" | "participant" | "system" | "scheduler";
  actorId?: string;
  commandId?: string;
  reasonCode?: string;
  sequence?: number;
  phaseId?: string | null;
  roundId?: string | null;
  matchId?: string | null;
  seriesId?: string | null;
  gameId?: string | null;
  participantId?: string | null;
  /** Free-form detail token, e.g. a refusal code. Never a decklist, a token or an email. */
  detail?: string;
};

/**
 * Test seam. Vitest drops INFO (see `src/logger.ts`), which is deliberate — the engine's INFO
 * stream is what exhausted the heap — so a test that needs to assert on the stream installs a sink
 * instead of scraping stdout.
 */
export type TournamentLogSink = (fields: TournamentLogFields) => void;

let sink: TournamentLogSink | undefined;

export function setTournamentLogSink(next: TournamentLogSink | undefined): void {
  sink = next;
}

export function logTournamentEvent(fields: TournamentLogFields): void {
  sink?.(fields);
  const line: Record<string, unknown> = { channel: "tournament" };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) line[key] = value;
  }
  log(JSON.stringify(line));
}
