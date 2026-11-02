import type { Migration } from "#api/db/migrator";

const STATEMENTS = [
  "ALTER TABLE tournament_result_ledger ADD COLUMN IF NOT EXISTS games_won integer",
  "ALTER TABLE tournament_result_ledger ADD COLUMN IF NOT EXISTS games_lost integer",
  "ALTER TABLE tournament_standings_snapshots ADD COLUMN IF NOT EXISTS game_win_rate double precision",
  "ALTER TABLE tournament_standings_snapshots ADD COLUMN IF NOT EXISTS opponent_opponent_match_win_rate double precision",
  "ALTER TABLE tournament_standings_snapshots ADD COLUMN IF NOT EXISTS opponent_points double precision",
  "ALTER TABLE tournament_standings_snapshots ADD COLUMN IF NOT EXISTS defeated_opponent_points double precision",
  "ALTER TABLE tournament_standings_snapshots ADD COLUMN IF NOT EXISTS game_difference double precision",
];

export const tournamentTiebreakValues: Migration = {
  id: "054-tournament-tiebreak-values",
  up: async (db) => {
    for (const statement of STATEMENTS) {
      await db.query(statement);
    }
  },
};
