export type TournamentStartedNotification = {
  tournamentId: string;
  tournamentName: string;
};

export type TournamentMatchReadyNotification = {
  tournamentId: string;
  tournamentName: string;
  round: number;
};
