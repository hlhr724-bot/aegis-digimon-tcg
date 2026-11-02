export const LeaveReplacementCallbackField = {
  CAUSE_ALLOWS: { name: "CAUSE_ALLOWS", value: "causeAllows" },
  PROTECTS: { name: "PROTECTS", value: "protects" },
  PREVENT_CHECK: { name: "PREVENT_CHECK", value: "preventCheck" },
  APPLIES_TO: { name: "APPLIES_TO", value: "appliesTo" },
  APPLIES_TO_PENDING: { name: "APPLIES_TO_PENDING", value: "appliesToPending" },
  APPLY: { name: "APPLY", value: "apply" },
} as const;

export type LeaveReplacementCallbackField =
  (typeof LeaveReplacementCallbackField)[keyof typeof LeaveReplacementCallbackField]["value"];
