import { TournamentReportAction } from "#shared/tournaments/TournamentReportAction";

export function isTournamentReportAction(value: unknown): value is TournamentReportAction {
  return typeof value === "string" && Object.values(TournamentReportAction).some((action) => action.value === value);
}
