export const ArenaGamepadLayout = {
  XBOX: {
    name: "XBOX",
    value: "xbox",
    confirmButton: 0,
    cancelButton: 1,
    labels: { confirm: "A", cancel: "B", inspect: "X", turn: "Y", regions: "LB RB" },
  },
  PLAYSTATION: {
    name: "PLAYSTATION",
    value: "playstation",
    confirmButton: 0,
    cancelButton: 1,
    labels: { confirm: "✕", cancel: "○", inspect: "□", turn: "△", regions: "L1 R1" },
  },
  NINTENDO: {
    name: "NINTENDO",
    value: "nintendo",
    confirmButton: 1,
    cancelButton: 0,
    labels: { confirm: "A", cancel: "B", inspect: "Y", turn: "X", regions: "L R" },
  },
} as const;

export type ArenaGamepadLayout = (typeof ArenaGamepadLayout)[keyof typeof ArenaGamepadLayout]["value"];
