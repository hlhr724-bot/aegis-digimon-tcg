import type { Migration } from "#api/db/migrator";

export const deckHistory: Migration = {
  id: "042-deck-history",
  up: async (db) => {
    await db.query(`CREATE TABLE account_deck_matches (
      account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      room_id text NOT NULL,
      deck_id text NOT NULL,
      deck_name text NOT NULL,
      record jsonb NOT NULL,
      PRIMARY KEY (account_id, room_id)
    )`);
    await db.query("CREATE INDEX account_deck_matches_deck ON account_deck_matches(account_id,deck_id)");
    await db.query("ALTER TABLE saved_decks ADD COLUMN cards_changed_at bigint NOT NULL DEFAULT 0");
  },
};
