export const ArenaCueDecalKind = {
  CHANNEL: { name: "CHANNEL", value: "channel", shaderCode: 0, isColumn: false },
  TINT: { name: "TINT", value: "tint", shaderCode: 1, isColumn: false },
  ARRIVAL: { name: "ARRIVAL", value: "arrival", shaderCode: 2, isColumn: false },
  COLUMN: { name: "COLUMN", value: "column", shaderCode: 0, isColumn: true },
} as const;

export type ArenaCueDecalKind = (typeof ArenaCueDecalKind)[keyof typeof ArenaCueDecalKind]["value"];

export type ArenaCueDecalKindEntry = (typeof ArenaCueDecalKind)[keyof typeof ArenaCueDecalKind];
