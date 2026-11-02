export const FriendRequestDirection = {
  INCOMING: { name: "INCOMING", value: "incoming" },
  OUTGOING: { name: "OUTGOING", value: "outgoing" },
} as const;

export type FriendRequestDirection = (typeof FriendRequestDirection)[keyof typeof FriendRequestDirection]["value"];
