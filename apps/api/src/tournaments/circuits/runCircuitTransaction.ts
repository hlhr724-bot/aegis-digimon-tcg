import type { PoolClient } from "pg";
import type { AccountStore } from "#api/accounts/AccountStore";

type Params<T> = {
  accounts: AccountStore;
  work: (db: PoolClient) => Promise<T>;
};

export async function runCircuitTransaction<T>({ accounts, work }: Params<T>): Promise<T> {
  await accounts.ensureReady();
  const db = await accounts.pool.connect();
  try {
    await db.query("BEGIN");
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
