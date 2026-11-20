import type { Migration } from "#api/db/migrator";

export const tournamentBetaCards: Migration = {
  id: "060-tournament-beta-cards",
  up: "ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS allow_beta_cards boolean NOT NULL DEFAULT false",
};
