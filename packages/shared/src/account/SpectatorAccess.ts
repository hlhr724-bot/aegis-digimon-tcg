export const SpectatorAccess = {
  EVERYONE: { name: "EVERYONE", value: "everyone" },
  FRIENDS: { name: "FRIENDS", value: "friends" },
  NOBODY: { name: "NOBODY", value: "nobody" },
} as const;

export type SpectatorAccess = (typeof SpectatorAccess)[keyof typeof SpectatorAccess]["value"];
