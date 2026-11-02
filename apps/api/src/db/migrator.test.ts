import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { PRE_MIGRATION_DDL } from "./preMigrationSchema.fixture.js";
import { createMemoryPool } from "./memoryPool.fixture.js";
import { migrations } from "./migrations/index.js";
import { type Migration, runMigrations } from "./migrator.js";

const TABLES = [
  "accounts",
  "login_identities",
  "sessions",
  "magic_links",
  "saved_decks",
  "match_records",
  "player_stats",
  "ranked_dodge_records",
  "match_deck_snapshots",
  "tournaments",
  "tournament_registrations",
  "tournament_matches",
  "room_tickets",
  "email_daily_usage",
];

async function tableNames(pool: Pool): Promise<string[]> {
  return (
    await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public'",
    )
  ).rows.map((row) => row.table_name);
}

async function appliedIds(pool: Pool): Promise<string[]> {
  return (await pool.query<{ id: string }>("SELECT id FROM schema_migrations ORDER BY id")).rows.map((row) => row.id);
}

const EXISTING_ACCOUNT_ID = "00000000-0000-0000-0000-0000000000aa";
const EXISTING_TOURNAMENT_ID = "00000000-0000-0000-0000-0000000000bb";

async function seedPreMigrationTournament(pool: Pool): Promise<void> {
  await pool.query(PRE_MIGRATION_DDL);
  await pool.query("INSERT INTO accounts (id, display_name, created_at) VALUES ($1,'Legacy',1)", [EXISTING_ACCOUNT_ID]);
  await pool.query(
    "INSERT INTO tournaments (id,name,block,status,starts_at,max_players,created_by,created_at) VALUES ($1,'Legacy Cup','BT10','registration',1,8,$2,1)",
    [EXISTING_TOURNAMENT_ID, EXISTING_ACCOUNT_ID],
  );
}

describe("runMigrations", () => {
  it("creates every table on an empty database and records what it applied", async () => {
    const pool = createMemoryPool();
    expect(await runMigrations(pool, migrations)).toEqual(migrations.map((migration) => migration.id));
    expect(await tableNames(pool)).toEqual(expect.arrayContaining(TABLES));
    expect(await appliedIds(pool)).toEqual([...migrations.map((migration) => migration.id)].sort());
  });

  it("is a no-op on re-run", async () => {
    const pool = createMemoryPool();
    await runMigrations(pool, migrations);
    expect(await runMigrations(pool, migrations)).toEqual([]);
    expect(await appliedIds(pool)).toHaveLength(migrations.length);
  });

  it("upgrades a legacy database created by the pre-migrator initialize()", async () => {
    const pool = createMemoryPool();
    await seedPreMigrationTournament(pool);
    expect(await runMigrations(pool, migrations)).toEqual(migrations.map((migration) => migration.id));
    expect(await tableNames(pool)).toEqual(expect.arrayContaining(TABLES));
    expect((await pool.query("SELECT name FROM tournaments WHERE id=$1", [EXISTING_TOURNAMENT_ID])).rows).toEqual([
      { name: "Legacy Cup" },
    ]);
  });

  it("backfills a legacy tournament as single-elimination best-of-one without Top Cut", async () => {
    const pool = createMemoryPool();
    await seedPreMigrationTournament(pool);
    await runMigrations(pool, migrations);
    expect(
      (
        await pool.query(
          "SELECT structure, best_of, top_cut_enabled, top_cut_size, rules_snapshot FROM tournaments WHERE id=$1",
          [EXISTING_TOURNAMENT_ID],
        )
      ).rows[0],
    ).toEqual({
      structure: "single_elimination",
      best_of: 1,
      top_cut_enabled: false,
      top_cut_size: null,
      rules_snapshot: null,
    });
  });

  it("preserves values already present when the program columns pre-exist from schema skew", async () => {
    const pool = createMemoryPool();
    await seedPreMigrationTournament(pool);
    await pool.query("ALTER TABLE tournaments ADD COLUMN structure text NOT NULL DEFAULT 'single_elimination'");
    await pool.query("ALTER TABLE tournaments ADD COLUMN best_of integer NOT NULL DEFAULT 1");
    await pool.query("ALTER TABLE tournaments ADD COLUMN top_cut_size integer");
    await pool.query("UPDATE tournaments SET structure='swiss', best_of=3, top_cut_size=8");
    await runMigrations(pool, migrations);
    expect(
      (
        await pool.query("SELECT structure, best_of, top_cut_size FROM tournaments WHERE id=$1", [
          EXISTING_TOURNAMENT_ID,
        ])
      ).rows[0],
    ).toEqual({ structure: "swiss", best_of: 3, top_cut_size: 8 });
  });

  it("gives a tournament created after the upgrade the same defaults", async () => {
    const pool = createMemoryPool();
    await runMigrations(pool, migrations);
    await pool.query("INSERT INTO accounts (id, display_name, created_at) VALUES ($1,'Fresh',1)", [
      EXISTING_ACCOUNT_ID,
    ]);
    await pool.query(
      "INSERT INTO tournaments (id,name,block,status,starts_at,max_players,created_by,created_at) VALUES ($1,'Fresh Cup','BT10','registration',1,8,$2,1)",
      [EXISTING_TOURNAMENT_ID, EXISTING_ACCOUNT_ID],
    );
    expect(
      (
        await pool.query("SELECT structure, best_of, top_cut_enabled, top_cut_size FROM tournaments WHERE id=$1", [
          EXISTING_TOURNAMENT_ID,
        ])
      ).rows[0],
    ).toEqual({
      structure: "single_elimination",
      best_of: 1,
      top_cut_enabled: false,
      top_cut_size: null,
    });
  });

  it("backfills a legacy tournament without banlist restrictions", async () => {
    const pool = createMemoryPool();
    await seedPreMigrationTournament(pool);
    await runMigrations(pool, migrations);
    expect(
      (
        await pool.query("SELECT allow_bots, banlist_policy, banlist_cards FROM tournaments WHERE id=$1", [
          EXISTING_TOURNAMENT_ID,
        ])
      ).rows[0],
    ).toEqual({
      allow_bots: false,
      banlist_policy: { mode: "none" },
      banlist_cards: [],
    });
  });

  it("preserves a banlist snapshot already present when the columns pre-exist from schema skew", async () => {
    const pool = createMemoryPool();
    await seedPreMigrationTournament(pool);
    await pool.query("ALTER TABLE tournaments ADD COLUMN ruleset_preset text");
    await pool.query("ALTER TABLE tournaments ADD COLUMN banlist_policy jsonb");
    await pool.query(`UPDATE tournaments SET ruleset_preset='bandai_general', banlist_policy='{"mode":"current"}'`);
    await runMigrations(pool, migrations);
    expect(
      (await pool.query("SELECT banlist_policy FROM tournaments WHERE id=$1", [EXISTING_TOURNAMENT_ID])).rows[0],
    ).toEqual({ banlist_policy: { mode: "current" } });
  });

  it("removes preset metadata while preserving the frozen rules of existing tournaments", async () => {
    const pool = createMemoryPool();
    await seedPreMigrationTournament(pool);
    await runMigrations(
      pool,
      migrations.filter((migration) => migration.id < "046-remove-tournament-presets"),
    );
    const rules = { version: "historical/1.0.0", match: { swissDurationMs: 123000 } };
    await pool.query("UPDATE tournaments SET rules_snapshot=$1 WHERE id=$2", [
      JSON.stringify(rules),
      EXISTING_TOURNAMENT_ID,
    ]);
    await runMigrations(pool, migrations);
    const row = (await pool.query("SELECT * FROM tournaments WHERE id=$1", [EXISTING_TOURNAMENT_ID])).rows[0];
    expect(row.rules_snapshot).toEqual(rules);
    const columns = (
      await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='tournaments'")
    ).rows.map((column) => column.column_name);
    expect(columns).not.toContain("ruleset_preset");
    expect(columns).not.toContain("ruleset_version");
  });

  it("applies only the pending tail when part of the history is already recorded", async () => {
    const pool = createMemoryPool();
    await runMigrations(pool, migrations.slice(0, 1));
    expect(await runMigrations(pool, migrations)).toEqual(migrations.slice(1).map((migration) => migration.id));
  });

  it("supports function migrations and passes the transaction client", async () => {
    const pool = createMemoryPool();
    const seen: string[] = [];
    const custom: Migration[] = [
      { id: "001-a", up: "CREATE TABLE probe (id text PRIMARY KEY)" },
      {
        id: "002-b",
        up: async (db) => {
          seen.push("ran");
          await db.query("INSERT INTO probe (id) VALUES ('x')");
        },
      },
    ];
    await runMigrations(pool, custom);
    expect(seen).toEqual(["ran"]);
    expect((await pool.query("SELECT id FROM probe")).rows).toEqual([{ id: "x" }]);
    expect(await runMigrations(pool, custom)).toEqual([]);
  });

  it("stops at the failing migration and leaves it unrecorded", async () => {
    const pool = createMemoryPool();
    const failing: Migration[] = [
      { id: "001-a", up: "CREATE TABLE probe (id text PRIMARY KEY)" },
      { id: "002-b", up: "SELECT * FROM missing_table" },
      { id: "003-c", up: "CREATE TABLE never (id text PRIMARY KEY)" },
    ];
    await expect(runMigrations(pool, failing)).rejects.toThrow("migration 002-b failed");
    expect(await appliedIds(pool)).toEqual(["001-a"]);
    expect(await tableNames(pool)).not.toContain("never");
  });

  it("rejects duplicate or out-of-order ids", async () => {
    const pool = createMemoryPool();
    await expect(
      runMigrations(pool, [
        { id: "001-a", up: "SELECT 1" },
        { id: "001-a", up: "SELECT 1" },
      ]),
    ).rejects.toThrow("duplicate migration id 001-a");
    await expect(
      runMigrations(pool, [
        { id: "002-b", up: "SELECT 1" },
        { id: "001-a", up: "SELECT 1" },
      ]),
    ).rejects.toThrow("is out of order");
  });
});
