export const TournamentReportAction = {
  DISMISS: { name: "DISMISS", value: "dismiss" },
  DELETE_TOURNAMENT: { name: "DELETE_TOURNAMENT", value: "delete_tournament" },
} as const;

export type TournamentReportAction = (typeof TournamentReportAction)[keyof typeof TournamentReportAction]["value"];
