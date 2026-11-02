import type { AccountStore } from "#api/accounts/AccountStore";
import { SpectatorAccess } from "@aegis/shared/account/SpectatorAccess";

type CanSpectatePlayersParams = {
  accounts: AccountStore;
  ownerIds: readonly (string | undefined)[];
  viewerId?: string;
};

export async function canSpectatePlayers({ accounts, ownerIds, viewerId }: CanSpectatePlayersParams): Promise<boolean> {
  for (const ownerId of ownerIds) {
    if (!ownerId) {
      continue;
    }
    const preferences = await accounts.preferences(ownerId);
    if (preferences.spectatorAccess === SpectatorAccess.NOBODY.value) {
      return false;
    }
    if (viewerId) {
      const blocks = await accounts.pool.query(
        "SELECT 1 FROM account_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)",
        [ownerId, viewerId],
      );
      if (blocks.rows.length) {
        return false;
      }
    }
    if (preferences.spectatorAccess === SpectatorAccess.FRIENDS.value && ownerId !== viewerId) {
      if (!viewerId) {
        return false;
      }
      const friends = await accounts.pool.query("SELECT 1 FROM friendships WHERE account_id=$1 AND friend_id=$2", [
        ownerId,
        viewerId,
      ]);
      if (!friends.rows.length) {
        return false;
      }
    }
  }
  return true;
}
