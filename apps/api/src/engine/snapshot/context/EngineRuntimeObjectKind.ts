export const EngineRuntimeObjectKind = {
  SCOPED_PRIMITIVES: { name: "SCOPED_PRIMITIVES", value: "scoped-primitives" },
  MATCHED_TRIGGER_HISTORY: { name: "MATCHED_TRIGGER_HISTORY", value: "matched-trigger-history" },
  RESOLUTION_DEPENDENCIES: { name: "RESOLUTION_DEPENDENCIES", value: "resolution-dependencies" },
  RESOLUTION_ENVIRONMENT: { name: "RESOLUTION_ENVIRONMENT", value: "resolution-environment" },
  IR_EFFECT: { name: "IR_EFFECT", value: "ir-effect" },
  TIMING_LOCKED_EFFECT: { name: "TIMING_LOCKED_EFFECT", value: "timing-locked-effect" },
  TIMING_WINDOW: { name: "TIMING_WINDOW", value: "timing-window" },
  RESOLUTION_PLAN: { name: "RESOLUTION_PLAN", value: "resolution-plan" },
  CARD_SOURCE: { name: "CARD_SOURCE", value: "card-source" },
  LENDER_CARD_SOURCE: { name: "LENDER_CARD_SOURCE", value: "lender-card-source" },
  EFFECT_CONTEXT: { name: "EFFECT_CONTEXT", value: "effect-context" },
} as const;
