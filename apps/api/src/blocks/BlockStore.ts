import { publishSocialChange } from "#api/social/publishSocialChange";
import type { FriendRow } from "#api/friends/FriendRow";
import { getFriendFromRow } from "#api/friends/getFriendFromRow";
import type { AccountStore } from "#api/accounts/AccountStore";
import type { Friend } from "@aegis/shared/friends/Friend";
import { FriendshipError } from "@aegis/shared/friends/FriendshipError";
import { runFriendTransaction } from "#api/friends/runFriendTransaction";
import { removeSocialLinks } from "#api/friends/removeSocialLinks";

type BlockPair = { accountId: string; otherId: string };

export class BlockStore {
  constructor(private readonly accounts: AccountStore) {}

  async list(accountId: string): Promise<Friend[]> {
    await this.accounts.ensureReady();
    const { rows } = await this.accounts.pool.query<FriendRow>(
      "SELECT a.id,a.display_name,a.avatar_url,a.avatar_id,b.created_at FROM account_blocks b JOIN accounts a ON a.id=b.blocked_id WHERE b.blocker_id=$1 ORDER BY b.created_at DESC",
      [accountId],
    );
    return rows.map(getFriendFromRow);
  }

  async block({ accountId, otherId }: BlockPair): Promise<{ error: FriendshipError } | { blocked: true }> {
    if (accountId === otherId) {
      return { error: FriendshipError.SELF.value };
    }
    const result = await runFriendTransaction<{ error: FriendshipError } | { blocked: true }>({
      accounts: this.accounts,
      accountIds: [accountId, otherId],
      run: async (db) => {
        if (!(await db.query("SELECT id FROM accounts WHERE id=$1", [otherId])).rows.length) {
          return { error: FriendshipError.NOT_FOUND.value };
        }
        await db.query(
          "INSERT INTO account_blocks (blocker_id,blocked_id,created_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
          [accountId, otherId, Date.now()],
        );
        await removeSocialLinks({ db, accountId, otherId });
        return { blocked: true };
      },
    });
    await publishSocialChange([accountId, otherId]);
    return result;
  }

  async unblock({ accountId, otherId }: BlockPair): Promise<void> {
    await runFriendTransaction({
      accounts: this.accounts,
      accountIds: [accountId, otherId],
      run: async (db) => {
        await db.query("DELETE FROM account_blocks WHERE blocker_id=$1 AND blocked_id=$2", [accountId, otherId]);
      },
    });
    await publishSocialChange([accountId, otherId]);
  }
}
