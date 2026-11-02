export const LogEffectRole = {
  SOURCE: { name: "SOURCE", value: "source" },
  RESULT: { name: "RESULT", value: "result" },
} as const;

export type LogEffectRole = (typeof LogEffectRole)[keyof typeof LogEffectRole]["value"];
