import type { Friend } from "#shared/friends/Friend";
import type { FriendRequestDirection } from "#shared/friends/FriendRequestDirection";

export type FriendRequest = Friend & { direction: FriendRequestDirection };
