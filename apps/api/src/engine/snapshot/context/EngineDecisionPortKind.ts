export const EngineDecisionPortKind = {
  STANDARD: { name: "STANDARD", value: "standard" },
  NO_PROMPT: { name: "NO_PROMPT", value: "no-prompt" },
} as const;

export type EngineDecisionPortKind = (typeof EngineDecisionPortKind)[keyof typeof EngineDecisionPortKind]["value"];
