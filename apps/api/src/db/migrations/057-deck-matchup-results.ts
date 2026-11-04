import type { Migration } from "#api/db/migrator";

export const deckMatchupResults: Migration = {
  id: "057-deck-matchup-results",
  up: async (db) => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS deck_matchup_results (
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        deck_id text NOT NULL,
        deck_key text NOT NULL,
        result jsonb NOT NULL,
        saved_at bigint NOT NULL,
        PRIMARY KEY (account_id, deck_id)
      )
    `);
  },
};
