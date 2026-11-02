import type { TournamentSpectateTarget } from "@/tournaments/TournamentSpectateTarget";

export type TournamentBracketSpectating = {
  tournamentId: string;
  onWatch: (target: TournamentSpectateTarget) => void;
};
