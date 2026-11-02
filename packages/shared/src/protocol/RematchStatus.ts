export const RematchStatus = {
  NONE: { name: "NONE", value: "" },
  OPEN: { name: "OPEN", value: "open" },
  OFFERED: { name: "OFFERED", value: "offered" },
  ACCEPTED: { name: "ACCEPTED", value: "accepted" },
  DECLINED: { name: "DECLINED", value: "declined" },
  CLOSED: { name: "CLOSED", value: "closed" },
} as const;

export type RematchStatus = (typeof RematchStatus)[keyof typeof RematchStatus]["value"];

export const REMATCH_BEST_OF = 3;
