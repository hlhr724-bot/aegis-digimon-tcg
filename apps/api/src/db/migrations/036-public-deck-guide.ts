import type { Migration } from "#api/db/migrator";

export const publicDeckGuide: Migration = {
  id: "036-public-deck-guide",
  up: async (db) => {
    await db.query("ALTER TABLE public_decks ADD COLUMN IF NOT EXISTS guide text");
  },
};
