import { describe, expect, it } from "vitest";
import {
  ARENA_FRAME_RATE_RECOVERY,
  shouldRestoreArenaFrameRate,
} from "@/game/arena3d/quality/shouldRestoreArenaFrameRate";

const RECOVERY = { cappedAt: 1000, delayMilliseconds: ARENA_FRAME_RATE_RECOVERY.firstDelayMilliseconds, attempts: 0 };

describe("arena frame rate recovery", () => {
  it("restores the frame rate after a calm period at the halved rate", () => {
    expect(shouldRestoreArenaFrameRate({ recovery: RECOVERY, now: 9000, frames: 120, lateFrames: 2 })).toBe(true);
  });

  it("waits until the backoff delay has passed", () => {
    expect(shouldRestoreArenaFrameRate({ recovery: RECOVERY, now: 8999, frames: 120, lateFrames: 0 })).toBe(false);
  });

  it("stays capped while the halved rate still misses frames", () => {
    expect(shouldRestoreArenaFrameRate({ recovery: RECOVERY, now: 20000, frames: 120, lateFrames: 3 })).toBe(false);
  });

  it("gives up after the last attempt so the rate cannot oscillate forever", () => {
    const exhausted = { ...RECOVERY, attempts: ARENA_FRAME_RATE_RECOVERY.maxAttempts };
    expect(shouldRestoreArenaFrameRate({ recovery: exhausted, now: 99999, frames: 120, lateFrames: 0 })).toBe(false);
  });

  it("does nothing before the rate was ever halved", () => {
    expect(shouldRestoreArenaFrameRate({ recovery: undefined, now: 99999, frames: 120, lateFrames: 0 })).toBe(false);
  });
});
