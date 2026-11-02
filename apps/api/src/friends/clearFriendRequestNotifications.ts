import type { Queryable } from "#api/db/migrator";

type ClearFriendRequestNotificationsParams = { db: Queryable; accountId: string; otherId: string };

export async function clearFriendRequestNotifications({
  db,
  accountId,
  otherId,
}: ClearFriendRequestNotificationsParams): Promise<void> {
  await db.query(
    "DELETE FROM notifications WHERE kind='friend_request' AND ((account_id=$1 AND subject=$3) OR (account_id=$2 AND subject=$4))",
    [accountId, otherId, `friend:${otherId}`, `friend:${accountId}`],
  );
}
