import type { Queryable } from "#api/db/migrator";

type Params = { db: Queryable; tournamentId: string; guildId?: string };

export async function getTournamentDiscordUrl({ db, tournamentId, guildId }: Params): Promise<string | null> {
  const row = (
    await db.query<{ guild_id: string | null; channel_id: string | null; thread_id: string | null }>(
      "SELECT guild_id,channel_id,thread_id FROM tournament_discord_posts WHERE tournament_id=$1",
      [tournamentId],
    )
  ).rows[0];
  const serverId = row?.guild_id ?? guildId;
  const channelId = row?.channel_id ?? row?.thread_id;
  if (!serverId || !channelId || !/^\d{17,20}$/.test(serverId) || !/^\d{17,20}$/.test(channelId)) {
    return null;
  }
  return `https://discord.com/channels/${serverId}/${channelId}`;
}
