export const EffectSourceMark = {
  PENDING: { name: "PENDING", value: "pending", labelKey: "overlay.effectSourcePending" },
  RESOLVING: { name: "RESOLVING", value: "resolving", labelKey: "overlay.effectSourceResolving" },
} as const;

export type EffectSourceMark = (typeof EffectSourceMark)[keyof typeof EffectSourceMark]["value"];
