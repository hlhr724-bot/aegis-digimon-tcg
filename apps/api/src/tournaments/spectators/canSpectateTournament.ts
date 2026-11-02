import type { Account, Tournament } from "#api/accounts/AccountStore";
import type { TournamentSpectatorStore } from "#api/tournaments/spectators/TournamentSpectatorStore";
import { TournamentSpectatorPolicy } from "@aegis/shared/tournaments/TournamentSpectatorPolicy";

type Params = {
  tournament: Pick<Tournament, "id" | "createdBy" | "spectatorPolicy">;
  account: Pick<Account, "id" | "isAdmin">;
  spectators: TournamentSpectatorStore;
};

export async function canSpectateTournament({ tournament, account, spectators }: Params): Promise<boolean> {
  const membership = { tournamentId: tournament.id, accountId: account.id };
  if (await spectators.isActiveParticipant(membership)) {
    return false;
  }
  if (account.isAdmin || tournament.createdBy === account.id) {
    return true;
  }
  if (tournament.spectatorPolicy === TournamentSpectatorPolicy.SIGNED_IN.value) {
    return true;
  }
  if (tournament.spectatorPolicy === TournamentSpectatorPolicy.ALLOWLIST.value) {
    return spectators.isListed(membership);
  }
  return false;
}
