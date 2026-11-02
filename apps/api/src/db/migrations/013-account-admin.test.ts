import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryPool } from "../memoryPool.fixture.js";
import { runMigrations } from "../migrator.js";
import { migrations } from "./index.js";

const adminMigrationIndex = migrations.findIndex((m) => m.id === "013-account-admin");

describe("013-account-admin", () => {
  let pool: Pool;

  beforeEach(async () => {
    pool = createMemoryPool();
    await runMigrations(pool, migrations.slice(0, adminMigrationIndex));
    await pool.query("INSERT INTO accounts (id, display_name, created_at) VALUES ($1,'Seeded',1),($2,'Other',1)", [
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000002",
    ]);
  });

  afterEach(async () => {
    delete process.env.ADMIN_DISPLAY_NAME;
    await pool.end();
  });

  it("promotes only the configured display name", async () => {
    process.env.ADMIN_DISPLAY_NAME = "seeded";
    await runMigrations(pool, migrations.slice(0, adminMigrationIndex + 1));
    expect((await pool.query("SELECT display_name, is_admin FROM accounts ORDER BY display_name")).rows).toEqual([
      { display_name: "Other", is_admin: false },
      { display_name: "Seeded", is_admin: true },
    ]);
  });

  it("promotes nobody when no display name is configured", async () => {
    await runMigrations(pool, migrations.slice(0, adminMigrationIndex + 1));
    expect((await pool.query("SELECT is_admin FROM accounts")).rows).toEqual([
      { is_admin: false },
      { is_admin: false },
    ]);
  });

  it("defaults accounts created later to non-admin", async () => {
    await runMigrations(pool, migrations.slice(0, adminMigrationIndex + 1));
    await pool.query("INSERT INTO accounts (id, display_name, created_at) VALUES ($1,'Later',2)", [
      "10000000-0000-4000-8000-000000000003",
    ]);
    expect((await pool.query("SELECT is_admin FROM accounts WHERE display_name='Later'")).rows[0]).toEqual({
      is_admin: false,
    });
  });
});
