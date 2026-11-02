export const ArenaUiScale = {
  DEFAULT: { name: "DEFAULT", value: "default", factor: 1, label: "100%" },
  LARGE: { name: "LARGE", value: "large", factor: 1.15, label: "115%" },
  LARGER: { name: "LARGER", value: "larger", factor: 1.3, label: "130%" },
} as const;

export type ArenaUiScale = (typeof ArenaUiScale)[keyof typeof ArenaUiScale]["value"];
