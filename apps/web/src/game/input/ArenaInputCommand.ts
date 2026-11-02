export const ArenaInputCommand = {
  UP: { name: "UP", value: "up" },
  DOWN: { name: "DOWN", value: "down" },
  LEFT: { name: "LEFT", value: "left" },
  RIGHT: { name: "RIGHT", value: "right" },
  CONFIRM: { name: "CONFIRM", value: "confirm" },
  CANCEL: { name: "CANCEL", value: "cancel" },
  INSPECT: { name: "INSPECT", value: "inspect" },
  TURN: { name: "TURN", value: "turn" },
  PREVIOUS_REGION: { name: "PREVIOUS_REGION", value: "previousRegion" },
  NEXT_REGION: { name: "NEXT_REGION", value: "nextRegion" },
  SCROLL_UP: { name: "SCROLL_UP", value: "scrollUp" },
  SCROLL_DOWN: { name: "SCROLL_DOWN", value: "scrollDown" },
} as const;

export type ArenaInputCommand = (typeof ArenaInputCommand)[keyof typeof ArenaInputCommand]["value"];
