import type { Migration } from "#api/db/migrator";

export const communityDeckModeration: Migration = {
  id: "040-community-deck-moderation",
  up: async (db) => {
    for (const column of [
      "hidden_reason text",
      "hidden_note text",
      "hidden_at bigint",
      "review_requested_at bigint",
      "review_note text",
    ])
      await db.query(`ALTER TABLE public_decks ADD COLUMN IF NOT EXISTS ${column}`);
  },
};
