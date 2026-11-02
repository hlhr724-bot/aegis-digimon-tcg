import { describe, expect, it } from "vitest";
import { stepArenaBreedingFocus } from "@/game/arena3d/breeding/stepArenaBreedingFocus";

const FRAME = 1 / 60;

function runFrames(active: boolean, level: number, frames: number): number {
  let current = level;
  for (let frame = 0; frame < frames; frame += 1) {
    current = stepArenaBreedingFocus({ level: current, active, delta: FRAME, reducedMotion: false });
  }
  return current;
}

describe("stepArenaBreedingFocus", () => {
  it("fades the dim in over about 180 ms", () => {
    expect(runFrames(true, 0, 5)).toBeGreaterThan(0.4);
    expect(runFrames(true, 0, 5)).toBeLessThan(0.6);
    expect(runFrames(true, 0, 11)).toBe(1);
  });

  it("fades the dim out at the same pace", () => {
    expect(runFrames(false, 1, 5)).toBeCloseTo(1 - runFrames(true, 0, 5), 6);
    expect(runFrames(false, 1, 11)).toBe(0);
  });

  it("changes at once under reduced motion", () => {
    expect(stepArenaBreedingFocus({ level: 0, active: true, delta: FRAME, reducedMotion: true })).toBe(1);
    expect(stepArenaBreedingFocus({ level: 1, active: false, delta: FRAME, reducedMotion: true })).toBe(0);
  });

  it("caps a long frame gap so an idle scene still fades", () => {
    expect(stepArenaBreedingFocus({ level: 0, active: true, delta: 2, reducedMotion: false })).toBeLessThan(0.25);
  });
});
