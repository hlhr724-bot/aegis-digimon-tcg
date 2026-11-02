import type { TournamentSpectator } from "#shared/tournaments/TournamentSpectator";
import type { TournamentSpectatorPolicy } from "#shared/tournaments/TournamentSpectatorPolicy";

export type TournamentSpectatorSettings = {
  policy: TournamentSpectatorPolicy;
  spectators: TournamentSpectator[];
};
