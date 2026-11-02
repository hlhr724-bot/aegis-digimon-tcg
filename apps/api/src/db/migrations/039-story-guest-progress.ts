import type { Migration } from "#api/db/migrator";

export const storyGuestProgress: Migration = {
  id: "039-story-guest-progress",
  up: async (db) => {
    await db.query(`CREATE TABLE IF NOT EXISTS story_guest_completions (
      guest_hash text NOT NULL,
      battle_id text NOT NULL,
      match_id text NOT NULL,
      completed_at bigint NOT NULL,
      PRIMARY KEY (guest_hash, battle_id)
    )`);
  },
};
