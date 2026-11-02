export const DecisionBasis = {
  SCORED: { name: "SCORED", value: "scored", isFixedDefault: false },
  FORCED: { name: "FORCED", value: "forced", isFixedDefault: false },
  RULE: { name: "RULE", value: "rule", isFixedDefault: false },
  FREE_EFFECT: { name: "FREE_EFFECT", value: "freeEffect", isFixedDefault: false },
  PROTECTION: { name: "PROTECTION", value: "protection", isFixedDefault: false },
  UNSCORED_OPTIONAL: { name: "UNSCORED_OPTIONAL", value: "unscoredOptional", isFixedDefault: true },
  UNSCORED_SELECTION: { name: "UNSCORED_SELECTION", value: "unscoredSelection", isFixedDefault: true },
  UNSCORED_CHOICE: { name: "UNSCORED_CHOICE", value: "unscoredChoice", isFixedDefault: true },
  TIE_BY_ORDER: { name: "TIE_BY_ORDER", value: "tieByOrder", isFixedDefault: true },
} as const;

export type DecisionBasis = (typeof DecisionBasis)[keyof typeof DecisionBasis]["value"];
