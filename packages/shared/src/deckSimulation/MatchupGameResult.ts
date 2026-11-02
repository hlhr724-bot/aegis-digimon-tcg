export const MatchupGameResult = {
  WIN: { name: "WIN", value: "win", points: 1 },
  LOSS: { name: "LOSS", value: "loss", points: 0 },
  DRAW: { name: "DRAW", value: "draw", points: 0.5 },
} as const;

export type MatchupGameResult = (typeof MatchupGameResult)[keyof typeof MatchupGameResult]["value"];
