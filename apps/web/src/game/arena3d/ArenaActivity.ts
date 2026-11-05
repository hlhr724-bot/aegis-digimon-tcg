import type { ArenaLateGap } from "@/game/arena3d/quality/ArenaLateGap";

export type ArenaActivity = {
  busyUntil: number;
  pacedUntil: number;
  frameRateCap: number;
  renderedFrames: number;
  lateGaps: ArenaLateGap[];
};
