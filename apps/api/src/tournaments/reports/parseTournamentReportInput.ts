import { isTournamentReportReason } from "@aegis/shared/tournaments/isTournamentReportReason";
import {
  TOURNAMENT_REPORT_DETAILS_MAX,
  type TournamentReportInput,
} from "@aegis/shared/tournaments/TournamentReportInput";

export function parseTournamentReportInput(body: unknown): TournamentReportInput | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const { reason, details } = body as Record<string, unknown>;
  if (!isTournamentReportReason(reason)) {
    return undefined;
  }
  if (details === undefined || details === null) {
    return { reason };
  }
  if (typeof details !== "string") {
    return undefined;
  }
  const trimmed = details.trim();
  if (trimmed.length > TOURNAMENT_REPORT_DETAILS_MAX) {
    return undefined;
  }
  return trimmed ? { reason, details: trimmed } : { reason };
}
