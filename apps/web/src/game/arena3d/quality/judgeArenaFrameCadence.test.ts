import { describe, expect, it } from "vitest";
import { ArenaCadenceVerdict } from "@/game/arena3d/quality/ArenaCadenceVerdict";
import { ARENA_CADENCE_WINDOW_FRAMES, judgeArenaFrameCadence } from "@/game/arena3d/quality/judgeArenaFrameCadence";

const WINDOW = ARENA_CADENCE_WINDOW_FRAMES;
const MISSING = WINDOW / 4;

describe("arena frame cadence judgement", () => {
  it("keeps a cadence that misses at most one frame in ten", () => {
    expect(judgeArenaFrameCadence({ frames: WINDOW, lateFrames: WINDOW / 10, frameRate: 60, canDowngrade: true })).toBe(
      ArenaCadenceVerdict.KEEP.value,
    );
  });

  it("waits for a full window", () => {
    expect(
      judgeArenaFrameCadence({ frames: WINDOW - 1, lateFrames: WINDOW - 1, frameRate: 60, canDowngrade: true }),
    ).toBe(ArenaCadenceVerdict.KEEP.value);
  });

  it("falls back from 60 to a steady 30 before lowering the tier", () => {
    expect(judgeArenaFrameCadence({ frames: WINDOW, lateFrames: MISSING, frameRate: 60, canDowngrade: true })).toBe(
      ArenaCadenceVerdict.HALVE_FRAME_RATE.value,
    );
  });

  it("lowers the tier when 30 fps also misses frames", () => {
    expect(judgeArenaFrameCadence({ frames: WINDOW, lateFrames: MISSING, frameRate: 30, canDowngrade: true })).toBe(
      ArenaCadenceVerdict.DOWNGRADE.value,
    );
  });

  it("falls back to 15 fps only when the tier cannot drop", () => {
    expect(judgeArenaFrameCadence({ frames: WINDOW, lateFrames: MISSING, frameRate: 30, canDowngrade: false })).toBe(
      ArenaCadenceVerdict.HALVE_FRAME_RATE.value,
    );
    expect(judgeArenaFrameCadence({ frames: WINDOW, lateFrames: MISSING, frameRate: 15, canDowngrade: false })).toBe(
      ArenaCadenceVerdict.KEEP.value,
    );
  });
});
