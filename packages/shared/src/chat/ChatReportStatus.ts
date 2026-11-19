export const ChatReportStatus = {
  AVAILABLE: { name: "AVAILABLE", value: "available" },
  REPORTED: { name: "REPORTED", value: "reported" },
  FAILED: { name: "FAILED", value: "failed" },
} as const;

export type ChatReportStatus = (typeof ChatReportStatus)[keyof typeof ChatReportStatus]["value"];
