import type { Migration } from "#api/db/migrator";

const STATEMENTS = [
  "ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS spectator_policy text NOT NULL DEFAULT 'nobody' CHECK (spectator_policy IN ('nobody','allowlist','signed_in'))",
  `CREATE TABLE IF NOT EXISTS tournament_spectators (
    tournament_id uuid NOT NULL REFERENCES tournaments(id),
    account_id uuid NOT NULL REFERENCES accounts(id),
    added_at bigint NOT NULL,
    PRIMARY KEY (tournament_id, account_id)
  )`,
];

export const tournamentSpectators: Migration = {
  id: "045-tournament-spectators",
  up: async (db) => {
    for (const statement of STATEMENTS) {
      await db.query(statement);
    }
  },
};
