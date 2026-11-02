export const BotArm = {
  CERTIFIED: { name: "CERTIFIED", value: "certified", usesCandidate: false, usesPlanner: false },
  LEGACY: { name: "LEGACY", value: "legacy", usesCandidate: false, usesPlanner: false },
  HUMAN_PANEL: { name: "HUMAN_PANEL", value: "humanPanel", usesCandidate: true, usesPlanner: false },
  HUMAN_PANEL_PLANNER: {
    name: "HUMAN_PANEL_PLANNER",
    value: "humanPanelPlanner",
    usesCandidate: true,
    usesPlanner: true,
  },
} as const;

export type BotArm = (typeof BotArm)[keyof typeof BotArm]["value"];
