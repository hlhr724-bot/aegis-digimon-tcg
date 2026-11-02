import { request } from "@/account/client";
import type { TournamentReport } from "@aegis/shared/tournaments/TournamentReport";
import type { TournamentReportAction } from "@aegis/shared/tournaments/TournamentReportAction";
import type { TournamentReportInput } from "@aegis/shared/tournaments/TournamentReportInput";

export const tournamentReportApi = {
  report: (tournamentId: string, input: TournamentReportInput) =>
    request<{ reported: true }>(`/tournaments/${encodeURIComponent(tournamentId)}/reports`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  listOpen: async () => (await request<{ reports: TournamentReport[] }>("/account/admin/tournament-reports")).reports,
  resolve: (reportId: number, action: TournamentReportAction) =>
    request<{ resolved: number }>(`/account/admin/tournament-reports/${reportId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
};
