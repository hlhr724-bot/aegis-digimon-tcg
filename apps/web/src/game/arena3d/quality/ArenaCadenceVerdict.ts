export const ArenaCadenceVerdict = {
  KEEP: { name: "KEEP", value: "keep" },
  HALVE_FRAME_RATE: { name: "HALVE_FRAME_RATE", value: "halve-frame-rate" },
  DOWNGRADE: { name: "DOWNGRADE", value: "downgrade" },
} as const;

export type ArenaCadenceVerdict = (typeof ArenaCadenceVerdict)[keyof typeof ArenaCadenceVerdict]["value"];
