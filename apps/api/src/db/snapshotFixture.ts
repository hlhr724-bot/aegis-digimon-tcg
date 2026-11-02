import type { Pool } from "pg";
import { createMemoryDatabase } from "#api/db/createMemoryDatabase";
import type { IBackup } from "pg-mem";
import { afterAll } from "vitest";

/**
 * Test-only memoization for expensive database fixtures.
 *
 * Tournament suites build their arrangements by driving the real stores: registering a field,
 * playing Swiss rounds, writing ledgers. That costs hundreds of milliseconds to several seconds per
 * test, and neighbouring tests in the same file almost always want the *same* arrangement — they
 * differ in what they then do to it, not in how it was reached.
 *
 * pg-mem can snapshot a whole database and restore it in well under a millisecond, so an
 * arrangement is worth building once per distinct shape and restoring for every test that wants it.
 * Each call to this factory owns its own cache, so one test file's fixtures never reach another's
 * even though `isolate: false` keeps the module graph alive across files.
 *
 * The value the builder returns (stores, ids, even a listening express server) is handed back
 * unchanged on a restore. That is sound because the stores are stateless wrappers over the pool —
 * `AccountStore`'s only instance state is its memoized migration promise, and the snapshot carries
 * the migrated schema — and because the restored rows carry the same ids the builder saw.
 *
 * The limit is in-memory state that never reached the database: it survives a restore, because a
 * restore only rewinds rows. `routes.profile.test.ts` is the worked example — its nickname rate
 * limiter keeps token buckets inside the express app, so sharing one app across tests would let an
 * earlier test spend a later one's tokens. A fixture holding state like that has to build per test
 * (as that file does) or reset it itself.
 */
export function snapshotFixtures<T>(): (key: string, build: (pool: Pool) => Promise<T>) => Promise<T> {
  const cache = new Map<string, { value: T; backup: IBackup }>();
  // Dropped when the file finishes. `isolate: false` keeps this module alive for the whole worker,
  // so without this every arrangement any file ever built — each one a whole in-memory database —
  // would stay reachable for the rest of the run, and the heap the later files run under would be
  // the sum of all of them.
  afterAll(() => cache.clear());
  return async function fixtureFor(key, build) {
    const cached = cache.get(key);
    if (cached) {
      cached.backup.restore();
      return cached.value;
    }
    const db = createMemoryDatabase({ noAstCoverageCheck: true });
    const value = await build(new (db.adapters.createPg().Pool)() as Pool);
    cache.set(key, { value, backup: db.backup() });
    return value;
  };
}
