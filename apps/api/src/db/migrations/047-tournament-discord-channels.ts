import type { Migration } from "#api/db/migrator";

export const tournamentDiscordChannels: Migration = {
  id: "047-tournament-discord-channels",
  up: async (db) => {
    await db.query("ALTER TABLE tournament_discord_posts ADD COLUMN IF NOT EXISTS channel_id text");
  },
};
