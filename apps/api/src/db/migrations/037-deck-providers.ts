import type { Migration } from "#api/db/migrator";

export const deckProviders: Migration = {
  id: "037-deck-providers",
  up: async (db) => {
    await db.query(
      "CREATE TABLE IF NOT EXISTS deck_provider_cache (key text PRIMARY KEY, body jsonb NOT NULL, expires_at bigint NOT NULL)",
    );
    await db.query(
      "CREATE TABLE IF NOT EXISTS deck_provider_sync_runs (provider text NOT NULL, period text NOT NULL, attempted_at bigint NOT NULL, completed_at bigint, collected_count integer NOT NULL DEFAULT 0, PRIMARY KEY (provider, period))",
    );
    await db.query(
      "CREATE TABLE IF NOT EXISTS deck_provider_snapshots (provider text NOT NULL, key text NOT NULL, body jsonb NOT NULL, collected_at bigint NOT NULL, PRIMARY KEY (provider, key))",
    );
  },
};
