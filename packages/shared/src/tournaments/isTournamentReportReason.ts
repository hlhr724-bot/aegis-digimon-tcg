import { TournamentReportReason } from "#shared/tournaments/TournamentReportReason";

export function isTournamentReportReason(value: unknown): value is TournamentReportReason {
  return typeof value === "string" && Object.values(TournamentReportReason).some((reason) => reason.value === value);
}
