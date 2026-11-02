export const CostModifierCallbackField = {
  EVO_COST_MATCH: { name: "EVO_COST_MATCH", value: "evoCostMatch" },
  PLAY_COST_MATCH: { name: "PLAY_COST_MATCH", value: "playCostMatch" },
  SUSPEND_TAMER_CONSUME: { name: "SUSPEND_TAMER_CONSUME", value: "suspendTamerConsume" },
} as const;

export type CostModifierCallbackField =
  (typeof CostModifierCallbackField)[keyof typeof CostModifierCallbackField]["value"];
