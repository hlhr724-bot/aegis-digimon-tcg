import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryPool } from "#api/db/memoryPool.fixture";
import { runMigrations } from "#api/db/migrator";
import { migrations } from "#api/db/migrations/index";

const rolesMigrationIndex = migrations.findIndex((migration) => migration.id === "050-account-roles");

describe("050-account-roles", () => {
  let pool: Pool;

  beforeEach(async () => {
    pool = createMemoryPool();
    await runMigrations(pool, migrations.slice(0, rolesMigrationIndex));
    await pool.query(
      "INSERT INTO accounts (id, display_name, created_at, is_admin) VALUES ($1,'Admin',1,true),($2,'Player',1,false)",
      ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002"],
    );
  });

  afterEach(async () => {
    await pool.end();
  });

  it("keeps existing admins as admins and gives everyone else no role", async () => {
    await runMigrations(pool, migrations);
    expect((await pool.query("SELECT display_name, roles FROM accounts ORDER BY display_name")).rows).toEqual([
      { display_name: "Admin", roles: ["admin"] },
      { display_name: "Player", roles: [] },
    ]);
  });

  it("removes the admin flag column", async () => {
    await runMigrations(pool, migrations);
    await expect(pool.query("SELECT is_admin FROM accounts")).rejects.toThrow(/is_admin/);
  });
});
