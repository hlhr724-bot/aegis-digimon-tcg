import type { AccountStore } from "#api/accounts/AccountStore";
import { runRankedTransaction } from "#api/ranked/runRankedTransaction";

type Params = { accounts: AccountStore; accountId: string; roomId: string; rankedPairId?: string };

export async function claimAccountRoom({ accounts, accountId, roomId, rankedPairId }: Params): Promise<boolean> {
  return runRankedTransaction({
    accounts,
    work: async (db) => {
      const queued = (
        await db.query<{ pair_id: string | null }>("SELECT pair_id FROM ranked_queue WHERE account_id=$1", [accountId])
      ).rows[0];
      if (queued && (!rankedPairId || queued.pair_id !== rankedPairId)) {
        return false;
      }
      const result = await db.query(
        "INSERT INTO account_active_rooms (account_id,room_id,expires_at) VALUES ($1,$2,$3) ON CONFLICT (account_id) DO UPDATE SET room_id=EXCLUDED.room_id,expires_at=EXCLUDED.expires_at WHERE account_active_rooms.room_id=$2 OR account_active_rooms.expires_at<$4 RETURNING account_id",
        [accountId, roomId, Date.now() + 120_000, Date.now()],
      );
      return Boolean(result.rowCount);
    },
  });
}
