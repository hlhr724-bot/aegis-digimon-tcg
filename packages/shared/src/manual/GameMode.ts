export const GameMode = {
  AUTOMATIC: { name: "AUTOMATIC", value: "automatic" },
  MANUAL: { name: "MANUAL", value: "manual" },
} as const;

export type GameMode = (typeof GameMode)[keyof typeof GameMode]["value"];
