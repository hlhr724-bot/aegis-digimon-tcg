import { describe, expect, it } from "vitest";
import { countArenaRenderLateFrames } from "@/game/arena3d/quality/countArenaRenderLateFrames";

describe("arena render-bound late frames", () => {
  const gaps = [
    { start: 0, end: 33 },
    { start: 100, end: 400 },
    { start: 500, end: 533 },
  ];

  it("ignores late frames that a main-thread long task delayed", () => {
    const overlapsLongTask = (start: number, end: number) => start < 380 && end > 120;
    expect(countArenaRenderLateFrames({ gaps, since: 0, overlapsLongTask })).toBe(2);
  });

  it("counts only late frames inside the current window", () => {
    expect(countArenaRenderLateFrames({ gaps, since: 450, overlapsLongTask: () => false })).toBe(1);
  });
});
