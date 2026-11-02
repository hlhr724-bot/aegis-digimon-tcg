export const EnginePrimitivePortKind = {
  STANDARD: { name: "STANDARD", value: "standard" },
  SCOPED: { name: "SCOPED", value: "scoped" },
} as const;

export type EnginePrimitivePortKind = (typeof EnginePrimitivePortKind)[keyof typeof EnginePrimitivePortKind]["value"];
