import { TournamentDiscordRole } from "#api/tournaments/discord/TournamentDiscordRole";

export function isTournamentDiscordRole(value: unknown): value is TournamentDiscordRole {
  return Object.values(TournamentDiscordRole).some((role) => role.value === value);
}
