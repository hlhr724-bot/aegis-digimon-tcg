import { describe, expect, it } from "vitest";
import { createMemoryPool } from "#api/db/memoryPool.fixture";
import { runMigrations } from "#api/db/migrator";
import { migrations } from "#api/db/migrations/index";

const noLock = async () => async () => undefined;
const ORGANIZER = "00000000-0000-4000-8000-000000000001";
const LIGHTNING_SNAPSHOT = { version: "aegis_lightning/1.1.0", origin: "aegis_custom" };

describe("044-community-tournaments", () => {
  it("moves lightning cups to the community preset and keeps their frozen rules", async () => {
    const pool = createMemoryPool();
    const before = migrations.findIndex((migration) => migration.id === "044-community-tournaments");
    await runMigrations(pool, migrations.slice(0, before), noLock);

    await pool.query("INSERT INTO accounts (id, display_name, created_at) VALUES ($1, 'Organizer', 0)", [ORGANIZER]);
    const insert = `INSERT INTO tournaments
      (id, name, block, status, starts_at, max_players, created_by, created_at, ruleset_preset, ruleset_version, rules_snapshot)
      VALUES ($1, $2, 'BT10', 'registration', 1, 8, $3, 1, $4, $5, $6)`;
    await pool.query(insert, [
      "00000000-0000-4000-8000-0000000000a1",
      "Lightning Cup",
      ORGANIZER,
      "aegis_lightning",
      LIGHTNING_SNAPSHOT.version,
      JSON.stringify(LIGHTNING_SNAPSHOT),
    ]);
    await pool.query(insert, [
      "00000000-0000-4000-8000-0000000000a2",
      "Regional Qualifier",
      ORGANIZER,
      "bandai_general",
      "bandai_general/1.1.0",
      null,
    ]);

    expect(await runMigrations(pool, migrations.slice(0, before + 1), noLock)).toEqual(["044-community-tournaments"]);

    const { rows } = await pool.query(
      "SELECT name, ruleset_preset, ruleset_version, rules_snapshot FROM tournaments ORDER BY name",
    );
    expect(rows).toEqual([
      {
        name: "Lightning Cup",
        ruleset_preset: "aegis_community",
        ruleset_version: "aegis_lightning/1.1.0",
        rules_snapshot: LIGHTNING_SNAPSHOT,
      },
      {
        name: "Regional Qualifier",
        ruleset_preset: "bandai_general",
        ruleset_version: "bandai_general/1.1.0",
        rules_snapshot: null,
      },
    ]);
  });
});
