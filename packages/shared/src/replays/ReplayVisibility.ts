export const ReplayVisibility = {
  PRIVATE: { name: "PRIVATE", value: "private" },
  FRIENDS: { name: "FRIENDS", value: "friends" },
  PUBLIC: { name: "PUBLIC", value: "public" },
} as const;

export type ReplayVisibility = (typeof ReplayVisibility)[keyof typeof ReplayVisibility]["value"];
