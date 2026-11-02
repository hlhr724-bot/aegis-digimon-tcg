export const ManualCombatStage = {
  NONE: { name: "NONE", value: "none" },
  ATTACK: { name: "ATTACK", value: "attack" },
  COUNTER: { name: "COUNTER", value: "counter" },
  BLOCK: { name: "BLOCK", value: "block" },
  RESOLUTION: { name: "RESOLUTION", value: "resolution" },
  SECURITY: { name: "SECURITY", value: "security" },
} as const;

export type ManualCombatStage = (typeof ManualCombatStage)[keyof typeof ManualCombatStage]["value"];
