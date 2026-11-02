import type { Migration } from "#api/db/migrator";

export const replayAnnotationSharing: Migration = {
  id: "056-replay-annotation-sharing",
  up: async (db) => {
    await db.query(
      "ALTER TABLE account_replays ADD COLUMN IF NOT EXISTS annotations_shared boolean NOT NULL DEFAULT false",
    );
  },
};
