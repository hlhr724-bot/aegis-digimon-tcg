export const ArenaCardTint = {
  BUFF: { name: "BUFF", value: "buff", color: "#ffb347" },
  DEBUFF: { name: "DEBUFF", value: "debuff", color: "#ff5a6a" },
  FREEZE: { name: "FREEZE", value: "freeze", color: "#7fe3ff" },
} as const;

export type ArenaCardTint = (typeof ArenaCardTint)[keyof typeof ArenaCardTint]["value"];

export type ArenaCardTintEntry = (typeof ArenaCardTint)[keyof typeof ArenaCardTint];
