export const SocialStatus = {
  ONLINE: { name: "ONLINE", value: "online", priority: 1 },
  IN_LOBBY: { name: "IN_LOBBY", value: "in_lobby", priority: 2 },
  IN_MATCH: { name: "IN_MATCH", value: "in_match", priority: 3 },
} as const;

export type SocialStatus = (typeof SocialStatus)[keyof typeof SocialStatus]["value"];
