import type { Migration } from "#api/db/migrator";

export const storyProgress: Migration = {
  id: "038-story-progress",
  up: async (db) => {
    await db.query(`CREATE TABLE IF NOT EXISTS story_battle_completions (
      account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      battle_id text NOT NULL,
      match_id text NOT NULL,
      completed_at bigint NOT NULL,
      PRIMARY KEY (account_id, battle_id)
    )`);
  },
};
