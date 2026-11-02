export const CombatSearchKind = {
  BLOCK: { name: "BLOCK", value: "block" },
  COUNTER: { name: "COUNTER", value: "counter" },
} as const;

export type CombatSearchKind = (typeof CombatSearchKind)[keyof typeof CombatSearchKind]["value"];
