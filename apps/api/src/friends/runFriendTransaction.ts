import type { PoolClient } from "pg";
import type { AccountStore } from "#api/accounts/AccountStore";

type RunFriendTransactionParams<T> = {
  accounts: AccountStore;
  accountIds: readonly string[];
  run: (client: PoolClient) => Promise<T>;
};

export async function runFriendTransaction<T>({
  accounts,
  accountIds,
  run,
}: RunFriendTransactionParams<T>): Promise<T> {
  await accounts.ensureReady();
  const client = await accounts.pool.connect();
  try {
    await client.query("BEGIN");
    for (const id of [...new Set(accountIds)].sort()) {
      await client.query("SELECT id FROM accounts WHERE id=$1 FOR UPDATE", [id]);
    }
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
