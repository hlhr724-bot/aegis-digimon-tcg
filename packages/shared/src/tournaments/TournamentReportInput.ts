import type { TournamentReportReason } from "#shared/tournaments/TournamentReportReason";

export const TOURNAMENT_REPORT_DETAILS_MAX = 500;

export type TournamentReportInput = {
  reason: TournamentReportReason;
  details?: string;
};
