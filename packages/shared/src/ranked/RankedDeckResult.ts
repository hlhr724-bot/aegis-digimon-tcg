export const RankedDeckResult = {
  WIN: { name: "WIN", value: "win" },
  LOSS: { name: "LOSS", value: "loss" },
  DRAW: { name: "DRAW", value: "draw" },
} as const;

export type RankedDeckResult = (typeof RankedDeckResult)[keyof typeof RankedDeckResult]["value"];
