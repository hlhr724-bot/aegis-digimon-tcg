import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { describe, expect, it } from "vitest";
import { migrations } from "#api/db/migrations/index";
import { runMigrations } from "#api/db/migrator";

describe.skipIf(process.env.POSTGRES_TESTS !== "1")("social migration with live account traffic", () => {
  it.each(["accounts", "account_replays"])(
    "lets an existing %s reader update accounts before replacing replay foreign keys",
    async (table) => {
      const schema = `migration_contention_${randomUUID().replaceAll("-", "")}`;
      const admin = new Pool({ connectionString: process.env.POSTGRES_TEST_URL });
      const pool = new Pool({ connectionString: process.env.POSTGRES_TEST_URL, options: `-c search_path=${schema}` });
      let migration: Promise<string[]> | undefined;
      let writer: PoolClient | undefined;
      let signalContention!: () => void;
      const contention = new Promise<void>((resolve) => {
        signalContention = resolve;
      });
      pool.on("connect", (client) => {
        const runQuery = client.query.bind(client);
        client.query = ((...args: Parameters<typeof client.query>) => {
          const result = runQuery(...args);
          if (typeof args[0] === "string" && args[0].startsWith("LOCK TABLE")) {
            return (result as unknown as Promise<unknown>).catch((error: unknown) => {
              if (typeof error === "object" && error !== null && "code" in error && error.code === "55P03") {
                signalContention();
              }
              throw error;
            });
          }
          return result;
        }) as typeof client.query;
      });
      try {
        await admin.query(`CREATE SCHEMA ${schema}`);
        await runMigrations(
          pool,
          migrations.filter((entry) => entry.id < "041"),
        );
        const accountId = randomUUID();
        await pool.query("INSERT INTO accounts (id,display_name,created_at) VALUES ($1,'Before migration',1)", [
          accountId,
        ]);
        writer = await pool.connect();
        await writer.query("BEGIN");
        await writer.query(`SELECT 1 FROM ${table}`);
        migration = runMigrations(pool, migrations);
        const outcome = migration.then(
          (ids) => ({ ids }),
          (error: unknown) => ({ error }),
        );
        await contention;
        await writer.query("UPDATE accounts SET display_name='After migration' WHERE id=$1", [accountId]);
        await writer.query("COMMIT");
        expect(await outcome).toEqual({ ids: ["041-friends-system"] });
        expect((await pool.query("SELECT display_name FROM accounts WHERE id=$1", [accountId])).rows).toEqual([
          { display_name: "After migration" },
        ]);
      } finally {
        await writer?.query("ROLLBACK");
        writer?.release();
        await migration?.catch(() => undefined);
        await pool.end();
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await admin.end();
      }
    },
    20_000,
  );
});
