import { ArenaCadenceVerdict } from "@/game/arena3d/quality/ArenaCadenceVerdict";

type Params = {
  frames: number;
  lateFrames: number;
  frameRate: number;
  canDowngrade: boolean;
  lowestTier: boolean;
};

export const ARENA_CADENCE_WINDOW_FRAMES = 120;

const MAX_LATE_SHARE = 0.1;
const PREFERRED_MIN_FRAME_RATE = 30;
const MIN_FRAME_RATE = 15;

export function judgeArenaFrameCadence({
  frames,
  lateFrames,
  frameRate,
  canDowngrade,
  lowestTier,
}: Params): ArenaCadenceVerdict {
  if (frames < ARENA_CADENCE_WINDOW_FRAMES || lateFrames <= frames * MAX_LATE_SHARE) {
    return ArenaCadenceVerdict.KEEP.value;
  }
  if (frameRate > PREFERRED_MIN_FRAME_RATE) {
    return ArenaCadenceVerdict.HALVE_FRAME_RATE.value;
  }
  if (canDowngrade) {
    return ArenaCadenceVerdict.DOWNGRADE.value;
  }
  if (lowestTier && frameRate > MIN_FRAME_RATE) {
    return ArenaCadenceVerdict.HALVE_FRAME_RATE.value;
  }
  return ArenaCadenceVerdict.KEEP.value;
}
