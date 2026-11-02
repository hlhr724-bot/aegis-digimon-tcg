export const FriendshipError = {
  NOT_FOUND: { name: "NOT_FOUND", value: "not_found" },
  BLOCKED: { name: "BLOCKED", value: "blocked" },
  LIMIT_REACHED: { name: "LIMIT_REACHED", value: "limit_reached" },
  ALREADY_FRIENDS: { name: "ALREADY_FRIENDS", value: "already_friends" },
  SELF: { name: "SELF", value: "self" },
} as const;

export type FriendshipError = (typeof FriendshipError)[keyof typeof FriendshipError]["value"];
