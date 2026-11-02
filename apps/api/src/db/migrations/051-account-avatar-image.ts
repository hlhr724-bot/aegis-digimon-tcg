import type { Migration } from "#api/db/migrator";

export const accountAvatarImage: Migration = {
  id: "051-account-avatar-image",
  up: async (db) => {
    for (const column of ["avatar_image bytea", "avatar_image_type text", "avatar_image_version bigint"])
      await db.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS ${column}`);
  },
};
