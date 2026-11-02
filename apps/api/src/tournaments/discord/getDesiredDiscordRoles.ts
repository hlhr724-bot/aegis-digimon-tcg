import { TournamentDiscordRole } from "#api/tournaments/discord/TournamentDiscordRole";
import type { TournamentDiscordConfig } from "#api/tournaments/discord/TournamentDiscordConfig";

type Params = {
  roles: TournamentDiscordConfig["roles"];
  isActiveParticipant: boolean;
  placements: readonly TournamentDiscordRole[];
};

export function getDesiredDiscordRoles({ roles, isActiveParticipant, placements }: Params): TournamentDiscordRole[] {
  const desired: TournamentDiscordRole[] = [];
  if (isActiveParticipant && roles[TournamentDiscordRole.PARTICIPANT.value]) {
    desired.push(TournamentDiscordRole.PARTICIPANT.value);
  }
  const best = Object.values(TournamentDiscordRole)
    .filter((role) => role.placementRank !== null && placements.includes(role.value) && roles[role.value])
    .sort((left, right) => (left.placementRank ?? 0) - (right.placementRank ?? 0))[0];
  if (best) {
    desired.push(best.value);
  }
  return desired.sort();
}
