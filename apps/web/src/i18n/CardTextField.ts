export const CardTextField = {
  EFFECT: { name: "EFFECT", value: "effectText" },
  INHERITED: { name: "INHERITED", value: "inheritedEffectText" },
  SECURITY: { name: "SECURITY", value: "securityEffectText" },
  OPTION: { name: "OPTION", value: "optionEffect" },
  LINK: { name: "LINK", value: "linkEffect" },
} as const;

export type CardTextField = (typeof CardTextField)[keyof typeof CardTextField]["value"];
