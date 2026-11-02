export const CloseCheckInOutcome = {
  START: { name: "START", value: "start" },
  CANCEL: { name: "CANCEL", value: "cancel" },
  BLOCKED: { name: "BLOCKED", value: "blocked" },
} as const;

export type CloseCheckInOutcome = (typeof CloseCheckInOutcome)[keyof typeof CloseCheckInOutcome]["value"];
