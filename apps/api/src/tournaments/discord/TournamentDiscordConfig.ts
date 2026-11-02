import type { TournamentDiscordRole } from "#api/tournaments/discord/TournamentDiscordRole";

export type TournamentDiscordConfig = {
  token: string;
  channelId: string;
  webUrl: string;
  guildId?: string;
  roles: Partial<Record<TournamentDiscordRole, string>>;
};
