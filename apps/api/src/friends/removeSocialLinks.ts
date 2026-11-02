import type { Queryable } from "#api/db/migrator";
import { clearFriendRequestNotifications } from "#api/friends/clearFriendRequestNotifications";

type RemoveSocialLinksParams = { db: Queryable; accountId: string; otherId: string };

export async function removeSocialLinks({ db, accountId, otherId }: RemoveSocialLinksParams): Promise<void> {
  await db.query("DELETE FROM friendships WHERE (account_id=$1 AND friend_id=$2) OR (account_id=$2 AND friend_id=$1)", [
    accountId,
    otherId,
  ]);
  await db.query(
    "DELETE FROM friend_requests WHERE (requester_id=$1 AND recipient_id=$2) OR (requester_id=$2 AND recipient_id=$1)",
    [accountId, otherId],
  );
  await clearFriendRequestNotifications({ db, accountId, otherId });
}
