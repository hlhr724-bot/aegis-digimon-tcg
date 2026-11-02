export const CardTextStatus = {
  COMPLETE: { name: "COMPLETE", value: "complete" },
  PARTIAL: { name: "PARTIAL", value: "partial" },
  MISSING: { name: "MISSING", value: "missing" },
  PENDING: { name: "PENDING", value: "pending" },
  ERROR: { name: "ERROR", value: "error" },
} as const;

export type CardTextStatus = (typeof CardTextStatus)[keyof typeof CardTextStatus]["value"];
