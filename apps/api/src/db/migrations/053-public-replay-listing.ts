import type { Migration } from "#api/db/migrator";

const STATEMENTS = [
  "ALTER TABLE account_replays ADD COLUMN IF NOT EXISTS format text",
  "ALTER TABLE account_replays ADD COLUMN IF NOT EXISTS player0_account_id uuid",
  "ALTER TABLE account_replays ADD COLUMN IF NOT EXISTS player1_account_id uuid",
  "ALTER TABLE account_replays ADD COLUMN IF NOT EXISTS identities_recorded boolean NOT NULL DEFAULT false",
  "ALTER TABLE account_replays ADD COLUMN IF NOT EXISTS published_at bigint",
  "CREATE INDEX IF NOT EXISTS account_replays_public ON account_replays(saved_at DESC, id DESC) WHERE published_at IS NOT NULL",
  "CREATE INDEX IF NOT EXISTS account_replays_public_format ON account_replays(format, saved_at DESC, id DESC) WHERE published_at IS NOT NULL",
];

export const publicReplayListing: Migration = {
  id: "053-public-replay-listing",
  up: async (db) => {
    for (const statement of STATEMENTS) {
      await db.query(statement);
    }
  },
};
