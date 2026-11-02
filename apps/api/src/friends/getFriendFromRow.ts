import { INITIALS_AVATAR, isDigimonWorldAvatarId } from "@aegis/shared/account/avatars";
import type { Friend } from "@aegis/shared/friends/Friend";
import type { FriendRow } from "#api/friends/FriendRow";

export function getFriendFromRow(row: FriendRow): Friend {
  return {
    accountId: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_id === INITIALS_AVATAR ? null : row.avatar_url,
    avatarId: isDigimonWorldAvatarId(row.avatar_id) ? row.avatar_id : null,
    since: Number(row.created_at),
  };
}
