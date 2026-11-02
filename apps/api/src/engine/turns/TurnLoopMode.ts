export const TurnLoopMode = {
  GAME: { name: "GAME", value: "game" },
  SINGLE_TURN: { name: "SINGLE_TURN", value: "single-turn" },
} as const;

export type TurnLoopMode = (typeof TurnLoopMode)[keyof typeof TurnLoopMode]["value"];
