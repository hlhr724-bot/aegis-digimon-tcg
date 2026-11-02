export const ArenaInputDevice = {
  KEYBOARD: { name: "KEYBOARD", value: "keyboard" },
  GAMEPAD: { name: "GAMEPAD", value: "gamepad" },
} as const;

export type ArenaInputDevice = (typeof ArenaInputDevice)[keyof typeof ArenaInputDevice]["value"];
