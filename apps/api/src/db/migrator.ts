import type { Pool, PoolClient } from "pg";
import { setTimeout } from "node:timers/promises";

export type Queryable = Pick<Pool | PoolClient, "query">;
export type Migration = { id: string; lock?: string; up: string | ((db: Queryable) => Promise<void>) };
export type ReleaseLock = () => Promise<void>;
export type AcquireLock = (pool: Pool) => Promise<ReleaseLock>;

const MIGRATIONS_TABLE =
  "CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at bigint NOT NULL)";

// Arbitrary but fixed: advisory locks share one namespace per database, so the key only has to
// stay stable and not collide with another application's. Never change it — two builds using
// different keys would not exclude each other, which is the whole point of taking the lock.
const MIGRATION_LOCK_KEY = "1869113953";

/**
 * Applies pending migrations in `id` order, one transaction each, and records them in
 * `schema_migrations` so re-runs are no-ops. Ids must be immutable once released: an applied
 * migration is never re-run, so edits to its body reach existing installations only as a new id.
 *
 * The whole run is serialized by a lock because multiple API containers can boot against one
 * database during a fixed-slot rollout: without it both compute the same pending list and the
 * loser dies on a duplicate `schema_migrations` insert. `acquireLock` is a seam for tests;
 * production uses the Postgres advisory lock.
 */
export async function runMigrations(
  pool: Pool,
  migrations: readonly Migration[],
  acquireLock: AcquireLock = acquireAdvisoryLock,
): Promise<string[]> {
  assertOrderedUniqueIds(migrations);
  const release = await acquireLock(pool);
  try {
    return await applyPending(pool, migrations);
  } finally {
    await release();
  }
}

/**
 * Session-level `pg_advisory_lock` held on its own connection for the length of the run, so the
 * per-migration transactions can commit under it. Falls back to no locking when the server has no
 * advisory locks at all, which today means only pg-mem: an in-process fake backing a single test
 * process has no second writer to exclude.
 */
export async function acquireAdvisoryLock(pool: Pool): Promise<ReleaseLock> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1::bigint)", [MIGRATION_LOCK_KEY]);
  } catch (error) {
    client.release();
    if (!lacksAdvisoryLocks(error)) throw error;
    return async () => undefined;
  }
  return async () => {
    try {
      await client.query("SELECT pg_advisory_unlock($1::bigint)", [MIGRATION_LOCK_KEY]);
    } finally {
      client.release();
    }
  };
}

async function applyPending(pool: Pool, migrations: readonly Migration[]): Promise<string[]> {
  await pool.query(MIGRATIONS_TABLE);
  const applied = new Set(
    (await pool.query<{ id: string }>("SELECT id FROM schema_migrations")).rows.map((row) => row.id),
  );
  const pending = migrations.filter((migration) => !applied.has(migration.id));
  for (const migration of pending) {
    const client = await pool.connect();
    try {
      await beginMigration(client, migration);
      if (typeof migration.up === "string") await client.query(migration.up);
      else await migration.up(client);
      await client.query("INSERT INTO schema_migrations (id, applied_at) VALUES ($1,$2)", [migration.id, Date.now()]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw new Error(`migration ${migration.id} failed: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    } finally {
      client.release();
    }
  }
  return pending.map((migration) => migration.id);
}

async function beginMigration(client: PoolClient, migration: Migration): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    await client.query("BEGIN");
    if (!migration.lock) {
      return;
    }
    try {
      await client.query(migration.lock);
      return;
    } catch (error) {
      await client.query("ROLLBACK");
      if (!(error instanceof Error) || !("code" in error) || error.code !== "55P03" || attempt >= 29) {
        throw error;
      }
      await setTimeout(Math.min(50 * (attempt + 1), 500));
    }
  }
}

function lacksAdvisoryLocks(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "42883")
    return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("pg_advisory_lock") && message.includes("does not exist");
}

function assertOrderedUniqueIds(migrations: readonly Migration[]): void {
  const ids = migrations.map((migration) => migration.id);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate) throw new Error(`duplicate migration id ${duplicate}`);
  const sorted = [...ids].sort();
  const misplaced = ids.findIndex((id, index) => id !== sorted[index]);
  if (misplaced >= 0) throw new Error(`migration ${ids[misplaced]} is out of order`);
}
