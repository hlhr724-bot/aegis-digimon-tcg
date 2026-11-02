export const ScopedPrimitiveKind = {
  STATIC: { name: "STATIC", value: "static" },
  EVOLUTION_COST: { name: "EVOLUTION_COST", value: "evolution-cost" },
  SECURITY: { name: "SECURITY", value: "security" },
} as const;

export type ScopedPrimitiveKind = (typeof ScopedPrimitiveKind)[keyof typeof ScopedPrimitiveKind]["value"];
