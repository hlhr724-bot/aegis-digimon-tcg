export const CostReplacementCallbackField = {
  INTO_MATCHES: { name: "INTO_MATCHES", value: "intoMatches" },
  APPLIES_TO: { name: "APPLIES_TO", value: "appliesTo" },
  ACTIVATE: { name: "ACTIVATE", value: "activate" },
  POTENTIAL_AMOUNT: { name: "POTENTIAL_AMOUNT", value: "potentialAmount" },
  AMOUNT_FOR_INTO: { name: "AMOUNT_FOR_INTO", value: "amountForInto" },
} as const;

export type CostReplacementCallbackField =
  (typeof CostReplacementCallbackField)[keyof typeof CostReplacementCallbackField]["value"];
