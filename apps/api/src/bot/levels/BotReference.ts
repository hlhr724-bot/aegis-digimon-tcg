export const BotReference = {
  SELECTED_LEVEL: { name: "SELECTED_LEVEL", value: "selected-level" },
  RANDOM_LEGAL: { name: "RANDOM_LEGAL", value: "random-legal" },
  LEGACY_BALANCED: { name: "LEGACY_BALANCED", value: "legacy-balanced" },
  CERTIFIED_RESIDUAL: { name: "CERTIFIED_RESIDUAL", value: "certified-residual" },
  HUMAN_PANEL: { name: "HUMAN_PANEL", value: "human-panel-v2" },
  TURN_PLANNER: { name: "TURN_PLANNER", value: "turn-planner" },
} as const;

export type BotReference = (typeof BotReference)[keyof typeof BotReference]["value"];
