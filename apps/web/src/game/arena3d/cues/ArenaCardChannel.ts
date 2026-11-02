export const ArenaCardChannel = {
  SOURCE: { name: "SOURCE", value: "source", color: "#c18cff", strength: 1, lift: 0.2, column: 0.85 },
  LINKED: { name: "LINKED", value: "linked", color: "#9ab8ff", strength: 0.6, lift: 0.1, column: 0.3 },
} as const;

export type ArenaCardChannel = (typeof ArenaCardChannel)[keyof typeof ArenaCardChannel]["value"];

export type ArenaCardChannelEntry = (typeof ArenaCardChannel)[keyof typeof ArenaCardChannel];
