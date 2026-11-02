import type { PoolClient } from "pg";
import type { AccountStore } from "#api/accounts/AccountStore";

type Params<T> = { accounts: AccountStore; work: (db: PoolClient) => Promise<T>; serialize?: boolean };

export async function runRankedTransaction<T>({ accounts, work, serialize = true }: Params<T>): Promise<T> {
  await accounts.ensureReady();
  const db = await accounts.pool.connect();
  try {
    await db.query("BEGIN");
    if (serialize) {
      await db.query("SELECT id FROM ranked_control WHERE id=1 FOR UPDATE");
    }
    const result = await work(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
