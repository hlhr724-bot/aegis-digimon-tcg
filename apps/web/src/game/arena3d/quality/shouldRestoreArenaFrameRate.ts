import type { ArenaFrameRateRecovery } from "@/game/arena3d/quality/ArenaFrameRateRecovery";

type Params = {
  recovery: ArenaFrameRateRecovery | undefined;
  now: number;
  frames: number;
  lateFrames: number;
};

export const ARENA_FRAME_RATE_RECOVERY = {
  firstDelayMilliseconds: 8000,
  maxAttempts: 3,
  maxLateShare: 0.02,
} as const;

export function shouldRestoreArenaFrameRate({ recovery, now, frames, lateFrames }: Params): boolean {
  if (!recovery || recovery.attempts >= ARENA_FRAME_RATE_RECOVERY.maxAttempts) {
    return false;
  }
  if (now - recovery.cappedAt < recovery.delayMilliseconds) {
    return false;
  }
  return lateFrames <= frames * ARENA_FRAME_RATE_RECOVERY.maxLateShare;
}
