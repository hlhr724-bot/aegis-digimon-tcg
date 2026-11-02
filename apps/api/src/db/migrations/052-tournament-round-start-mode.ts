import type { Migration } from "#api/db/migrator";

export const tournamentRoundStartMode: Migration = {
  id: "052-tournament-round-start-mode",
  up: "ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS round_start_mode text NOT NULL DEFAULT 'automatic' CHECK (round_start_mode IN ('automatic','manual'))",
};
