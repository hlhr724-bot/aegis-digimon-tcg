export const ArenaFrameVerdict = {
  SKIP: { name: "SKIP", value: "skip", renders: false },
  ON_TIME: { name: "ON_TIME", value: "on-time", renders: true },
  LATE: { name: "LATE", value: "late", renders: true },
} as const;

export type ArenaFrameVerdict = (typeof ArenaFrameVerdict)[keyof typeof ArenaFrameVerdict]["value"];
