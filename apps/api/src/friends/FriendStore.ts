import { publishSocialChange } from "#api/social/publishSocialChange";
import type { FriendRow } from "#api/friends/FriendRow";
import { getFriendFromRow } from "#api/friends/getFriendFromRow";
import type { PoolClient } from "pg";
import type { AccountStore } from "#api/accounts/AccountStore";
import type { Friend } from "@aegis/shared/friends/Friend";
import type { FriendRequest } from "@aegis/shared/friends/FriendRequest";
import { FriendRequestDirection } from "@aegis/shared/friends/FriendRequestDirection";
import { FriendshipError } from "@aegis/shared/friends/FriendshipError";
import { friendLimits } from "@aegis/shared/friends/friendLimits";
import { notify } from "#api/notifications/NotificationStore";
import { clearFriendRequestNotifications } from "#api/friends/clearFriendRequestNotifications";
import { runFriendTransaction } from "#api/friends/runFriendTransaction";

type Pair = { accountId: string; otherId: string };
type RequestFriendParams = { accountId: string; displayName?: string; matchId?: string };
type MutationResult = { accepted: boolean } | { error: FriendshipError };

export class FriendStore {
  constructor(private readonly accounts: AccountStore) {}

  async list(accountId: string): Promise<Friend[]> {
    await this.accounts.ensureReady();
    const { rows } = await this.accounts.pool.query<FriendRow>(
      "SELECT a.id,a.display_name,a.avatar_url,a.avatar_id,f.created_at FROM friendships f JOIN accounts a ON a.id=f.friend_id WHERE f.account_id=$1 ORDER BY lower(a.display_name)",
      [accountId],
    );
    return rows.map(getFriendFromRow);
  }

  async listRequests(accountId: string): Promise<FriendRequest[]> {
    await this.accounts.ensureReady();
    const { rows } = await this.accounts.pool.query<FriendRow & { requester_id: string }>(
      "SELECT a.id,a.display_name,a.avatar_url,a.avatar_id,r.created_at,r.requester_id FROM friend_requests r JOIN accounts a ON a.id=CASE WHEN r.requester_id=$1 THEN r.recipient_id ELSE r.requester_id END WHERE r.requester_id=$1 OR r.recipient_id=$1 ORDER BY r.created_at DESC",
      [accountId],
    );
    return rows.map((row) => ({
      ...getFriendFromRow(row),
      direction:
        row.requester_id === accountId ? FriendRequestDirection.OUTGOING.value : FriendRequestDirection.INCOMING.value,
    }));
  }

  async request({ accountId, displayName, matchId }: RequestFriendParams): Promise<MutationResult> {
    await this.accounts.ensureReady();
    let otherId: string | undefined;
    if (matchId !== undefined) {
      const { rows } = await this.accounts.pool.query<{ record: { opponentAccountId?: string } }>(
        "SELECT record FROM account_recent_matches WHERE account_id=$1 AND (match_id=$2 OR room_id=$2)",
        [accountId, matchId],
      );
      otherId = rows[0]?.record.opponentAccountId;
    } else {
      const { rows } = await this.accounts.pool.query<{ id: string }>(
        "SELECT id FROM accounts WHERE lower(display_name)=lower($1)",
        [displayName],
      );
      otherId = rows[0]?.id;
    }
    if (!otherId) {
      return { error: FriendshipError.NOT_FOUND.value };
    }
    return this.mutatePair({ accountId, otherId }, false);
  }

  async accept(pair: Pair): Promise<MutationResult> {
    return this.mutatePair(pair, true);
  }

  async decline({ accountId, otherId }: Pair): Promise<void> {
    await runFriendTransaction({
      accounts: this.accounts,
      accountIds: [accountId, otherId],
      run: async (db) => {
        await db.query("DELETE FROM friend_requests WHERE requester_id=$2 AND recipient_id=$1", [accountId, otherId]);
        await clearFriendRequestNotifications({ db, accountId, otherId });
      },
    });
    await publishSocialChange([accountId, otherId]);
  }

  async cancel({ accountId, otherId }: Pair): Promise<void> {
    await runFriendTransaction({
      accounts: this.accounts,
      accountIds: [accountId, otherId],
      run: async (db) => {
        await db.query("DELETE FROM friend_requests WHERE requester_id=$1 AND recipient_id=$2", [accountId, otherId]);
        await clearFriendRequestNotifications({ db, accountId, otherId });
      },
    });
    await publishSocialChange([accountId, otherId]);
  }

  async remove({ accountId, otherId }: Pair): Promise<void> {
    await runFriendTransaction({
      accounts: this.accounts,
      accountIds: [accountId, otherId],
      run: async (db) => {
        await db.query(
          "DELETE FROM friendships WHERE (account_id=$1 AND friend_id=$2) OR (account_id=$2 AND friend_id=$1)",
          [accountId, otherId],
        );
      },
    });
    await publishSocialChange([accountId, otherId]);
  }

  private async mutatePair({ accountId, otherId }: Pair, accepting: boolean): Promise<MutationResult> {
    if (accountId === otherId) {
      return { error: FriendshipError.SELF.value };
    }
    const result = await runFriendTransaction<MutationResult>({
      accounts: this.accounts,
      accountIds: [accountId, otherId],
      run: async (db) => {
        const accounts = (
          await db.query<{ id: string; display_name: string }>(
            "SELECT id,display_name FROM accounts WHERE id=$1 OR id=$2",
            [accountId, otherId],
          )
        ).rows;
        if (accounts.length !== 2) {
          return { error: FriendshipError.NOT_FOUND.value };
        }
        const blocks = await db.query(
          "SELECT 1 FROM account_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)",
          [accountId, otherId],
        );
        if (blocks.rows.length) {
          return { error: FriendshipError.BLOCKED.value };
        }
        if (
          (await db.query("SELECT 1 FROM friendships WHERE account_id=$1 AND friend_id=$2", [accountId, otherId])).rows
            .length
        ) {
          return { error: FriendshipError.ALREADY_FRIENDS.value };
        }
        const reverse =
          (
            await db.query("SELECT 1 FROM friend_requests WHERE requester_id=$2 AND recipient_id=$1", [
              accountId,
              otherId,
            ])
          ).rows.length > 0;
        if (accepting && !reverse) {
          return { error: FriendshipError.NOT_FOUND.value };
        }
        for (const id of [accountId, otherId]) {
          if ((await countRows({ db, table: "friendships", column: "account_id", id })) >= friendLimits.friends) {
            return { error: FriendshipError.LIMIT_REACHED.value };
          }
        }
        const at = Date.now();
        const actorName = accounts.find((account) => account.id === accountId)!.display_name;
        if (reverse) {
          await db.query("INSERT INTO friendships (account_id,friend_id,created_at) VALUES ($1,$2,$3),($2,$1,$3)", [
            accountId,
            otherId,
            at,
          ]);
          await db.query(
            "DELETE FROM friend_requests WHERE (requester_id=$1 AND recipient_id=$2) OR (requester_id=$2 AND recipient_id=$1)",
            [accountId, otherId],
          );
          await clearFriendRequestNotifications({ db, accountId, otherId });
          await notify(db, {
            accountId: otherId,
            kind: "friend_accepted",
            subject: `friend:${accountId}`,
            payload: { accountId, displayName: actorName },
            at,
          });
          return { accepted: true };
        }
        if (
          (
            await db.query("SELECT 1 FROM friend_requests WHERE requester_id=$1 AND recipient_id=$2", [
              accountId,
              otherId,
            ])
          ).rows.length
        ) {
          return { accepted: false };
        }
        if (
          (await countRows({ db, table: "friend_requests", column: "requester_id", id: accountId })) >=
          friendLimits.outgoingRequests
        ) {
          return { error: FriendshipError.LIMIT_REACHED.value };
        }
        await db.query("INSERT INTO friend_requests (requester_id,recipient_id,created_at) VALUES ($1,$2,$3)", [
          accountId,
          otherId,
          at,
        ]);
        await notify(db, {
          accountId: otherId,
          kind: "friend_request",
          subject: `friend:${accountId}`,
          payload: { accountId, displayName: actorName },
          at,
        });
        return { accepted: false };
      },
    });
    if (!("error" in result)) {
      await publishSocialChange([accountId, otherId]);
    }
    return result;
  }
}

type CountRowsParams = {
  db: PoolClient;
  table: "friendships" | "friend_requests";
  column: "account_id" | "requester_id";
  id: string;
};

async function countRows({ db, table, column, id }: CountRowsParams): Promise<number> {
  return Number(
    (await db.query<{ count: string }>(`SELECT count(*) AS count FROM ${table} WHERE ${column}=$1`, [id])).rows[0]
      ?.count ?? 0,
  );
}
