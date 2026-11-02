import type { TournamentReportReason } from "#shared/tournaments/TournamentReportReason";

export type TournamentReport = {
  id: number;
  tournamentId: string;
  tournamentName: string;
  organizerName: string;
  canDeleteTournament: boolean;
  reason: TournamentReportReason;
  details: string | null;
  reporterName: string | null;
  createdAt: number;
  openReportsForTournament: number;
};
