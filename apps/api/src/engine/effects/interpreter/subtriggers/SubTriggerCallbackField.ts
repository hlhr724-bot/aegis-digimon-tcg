export const SubTriggerCallbackField = {
  RUN: { name: "RUN", value: "run" },
  MATCHES: { name: "MATCHES", value: "matches" },
  CAN_FIRE: { name: "CAN_FIRE", value: "canFire" },
  HAS_LEGAL_OUTCOME: { name: "HAS_LEGAL_OUTCOME", value: "hasLegalOutcome" },
  ATTACK_REDIRECT_TARGETS: { name: "ATTACK_REDIRECT_TARGETS", value: "attackRedirectTargetIds" },
} as const;

export type SubTriggerCallbackField = (typeof SubTriggerCallbackField)[keyof typeof SubTriggerCallbackField]["value"];
