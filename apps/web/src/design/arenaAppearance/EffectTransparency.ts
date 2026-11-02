export const EffectTransparency = {
  OPAQUE: { name: "OPAQUE", value: "opaque", panel: "100%", scrim: 0.5, labelKey: "settings.transparencyOpaque" },
  SUBTLE: { name: "SUBTLE", value: "subtle", panel: "92%", scrim: 0.3, labelKey: "settings.transparencySubtle" },
  CLEAR: { name: "CLEAR", value: "clear", panel: "80%", scrim: 0.12, labelKey: "settings.transparencyClear" },
} as const;

export type EffectTransparency = (typeof EffectTransparency)[keyof typeof EffectTransparency]["value"];
