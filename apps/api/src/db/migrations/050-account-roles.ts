import type { Migration } from "#api/db/migrator";

export const accountRoles: Migration = {
  id: "050-account-roles",
  up: async (db) => {
    await db.query("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS roles text[] NOT NULL DEFAULT ARRAY[]::text[]");
    await db.query("UPDATE accounts SET roles=ARRAY['admin'] WHERE is_admin=true");
    await db.query("ALTER TABLE accounts DROP COLUMN IF EXISTS is_admin");
  },
};
