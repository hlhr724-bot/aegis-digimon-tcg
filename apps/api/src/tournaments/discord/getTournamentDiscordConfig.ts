import type { TournamentDiscordConfig } from "#api/tournaments/discord/TournamentDiscordConfig";
import { isTournamentDiscordRole } from "#api/tournaments/discord/isTournamentDiscordRole";

const SNOWFLAKE = /^\d{17,20}$/;

export function getTournamentDiscordConfig(env: NodeJS.ProcessEnv = process.env): TournamentDiscordConfig | undefined {
  const token = env.AEGIS_TOURNAMENT_DISCORD_BOT_TOKEN || env.AEGIS_DISCORD_BOT_TOKEN || env.DISCORD_BOT_TOKEN;
  const channelId = env.AEGIS_TOURNAMENT_DISCORD_CHANNEL_ID;
  if (!token || !channelId) {
    return undefined;
  }
  if (!SNOWFLAKE.test(channelId)) {
    throw new Error("tournament_discord_invalid_channel");
  }
  const guildId = env.AEGIS_TOURNAMENT_DISCORD_GUILD_ID || undefined;
  if (guildId !== undefined && !SNOWFLAKE.test(guildId)) {
    throw new Error("tournament_discord_invalid_guild");
  }
  const roles: TournamentDiscordConfig["roles"] = {};
  if (env.AEGIS_TOURNAMENT_DISCORD_ROLES) {
    const parsed: unknown = JSON.parse(env.AEGIS_TOURNAMENT_DISCORD_ROLES);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || guildId === undefined) {
      throw new Error("tournament_discord_invalid_roles");
    }
    for (const [role, id] of Object.entries(parsed)) {
      if (!isTournamentDiscordRole(role) || typeof id !== "string" || !SNOWFLAKE.test(id)) {
        throw new Error("tournament_discord_invalid_roles");
      }
      roles[role] = id;
    }
  }
  return {
    token,
    channelId,
    guildId,
    roles,
    webUrl: (env.AEGIS_WEB_URL ?? "http://localhost:5173").replace(/\/+$/, ""),
  };
}
