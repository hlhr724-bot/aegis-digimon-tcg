import type { Migration } from "#api/db/migrator";

export const tournamentDiscordGuild: Migration = {
  id: "048-tournament-discord-guild",
  up: async (db) => {
    await db.query("ALTER TABLE tournament_discord_posts ADD COLUMN IF NOT EXISTS guild_id text");
  },
};
