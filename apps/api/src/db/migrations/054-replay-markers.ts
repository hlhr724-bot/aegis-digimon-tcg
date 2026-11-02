import type { Migration } from "#api/db/migrator";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS replay_markers (
     id uuid PRIMARY KEY,
     author_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     match_id text NOT NULL,
     frame_index integer NOT NULL CHECK (frame_index BETWEEN 0 AND 4999),
     turn integer NOT NULL CHECK (turn BETWEEN 0 AND 10000),
     emoji text NOT NULL,
     created_at bigint NOT NULL
   )`,
  "CREATE INDEX IF NOT EXISTS replay_markers_author_match ON replay_markers(author_id, match_id, frame_index)",
  "CREATE INDEX IF NOT EXISTS replay_markers_match ON replay_markers(match_id)",
];

export const replayMarkers: Migration = {
  id: "054-replay-markers",
  up: async (db) => {
    for (const statement of STATEMENTS) {
      await db.query(statement);
    }
  },
};
