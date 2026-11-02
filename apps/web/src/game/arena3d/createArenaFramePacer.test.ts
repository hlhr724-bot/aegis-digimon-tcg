import { describe, expect, it } from "vitest";
import { ArenaFrameVerdict } from "@/game/arena3d/ArenaFrameVerdict";
import { createArenaFramePacer } from "@/game/arena3d/createArenaFramePacer";

type ClockParams = {
  refreshRate: number;
  frameRate: number;
  ticks: number;
  jitterMilliseconds?: number;
  droppedTicks?: ReadonlySet<number>;
  isAnimating?: (tick: number) => boolean;
  isPaused?: (tick: number) => boolean;
};

type RenderedFrame = {
  tick: number;
  at: number;
  verdict: ArenaFrameVerdict;
};

function runFakeAnimationFrames({
  refreshRate,
  frameRate,
  ticks,
  jitterMilliseconds = 0,
  droppedTicks = new Set(),
  isAnimating = () => true,
  isPaused = () => false,
}: ClockParams): RenderedFrame[] {
  const pacer = createArenaFramePacer();
  const vsync = 1000 / refreshRate;
  const rendered: RenderedFrame[] = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    if (droppedTicks.has(tick)) {
      continue;
    }
    const jitter = tick % 2 === 0 ? jitterMilliseconds : -jitterMilliseconds;
    const at = 1000 + tick * vsync + jitter;
    const verdict = pacer.decideFrame({ now: at, frameRate, animating: isAnimating(tick), paused: isPaused(tick) });
    if (verdict !== ArenaFrameVerdict.SKIP.value) {
      rendered.push({ tick, at, verdict });
    }
  }
  return rendered;
}

function countTickGaps(frames: readonly RenderedFrame[]): Record<number, number> {
  const gaps: Record<number, number> = {};
  for (let index = 1; index < frames.length; index += 1) {
    const gap = frames[index]!.tick - frames[index - 1]!.tick;
    gaps[gap] = (gaps[gap] ?? 0) + 1;
  }
  return gaps;
}

describe("arena frame pacer", () => {
  it("renders every second vsync for 60 fps on a 120 Hz display", () => {
    const frames = runFakeAnimationFrames({ refreshRate: 120, frameRate: 60, ticks: 240, jitterMilliseconds: 1.5 });
    const steady = frames.filter((frame) => frame.tick >= 20);
    expect(countTickGaps(steady)).toEqual({ 2: steady.length - 1 });
  });

  it("renders every second vsync for 30 fps on a 60 Hz display without uneven gaps", () => {
    const frames = runFakeAnimationFrames({ refreshRate: 60, frameRate: 30, ticks: 180, jitterMilliseconds: 2 });
    expect(countTickGaps(frames)).toEqual({ 2: frames.length - 1 });
  });

  it("renders every fourth vsync for 30 fps on a 120 Hz display", () => {
    const frames = runFakeAnimationFrames({ refreshRate: 120, frameRate: 30, ticks: 240, jitterMilliseconds: 1 });
    const steady = frames.filter((frame) => frame.tick >= 20);
    expect(countTickGaps(steady)).toEqual({ 4: steady.length - 1 });
  });

  it("renders every vsync when the display matches the target", () => {
    const frames = runFakeAnimationFrames({ refreshRate: 60, frameRate: 60, ticks: 120 });
    expect(frames).toHaveLength(120);
  });

  it("marks a frame late after a dropped vsync and keeps the stride afterwards", () => {
    const frames = runFakeAnimationFrames({
      refreshRate: 60,
      frameRate: 30,
      ticks: 120,
      droppedTicks: new Set([60]),
    });
    const late = frames.filter((frame) => frame.verdict === ArenaFrameVerdict.LATE.value);
    expect(late.map((frame) => frame.tick)).toEqual([61]);
    expect(countTickGaps(frames.filter((frame) => frame.tick >= 61))).toEqual({
      2: frames.filter((frame) => frame.tick >= 61).length - 1,
    });
  });

  it("drops a still scene to an exact divisor of the target and returns on the next vsync", () => {
    const frames = runFakeAnimationFrames({
      refreshRate: 60,
      frameRate: 30,
      ticks: 240,
      isAnimating: (tick) => tick >= 120,
    });
    const still = frames.filter((frame) => frame.tick >= 20 && frame.tick < 120);
    expect(Object.keys(countTickGaps(still))).toEqual(["6"]);
    const resumed = frames.find((frame) => frame.tick >= 120)!;
    expect(resumed.tick - 120).toBeLessThan(6);
    expect(resumed.verdict).toBe(ArenaFrameVerdict.ON_TIME.value);
    expect(countTickGaps(frames.filter((frame) => frame.tick >= resumed.tick))).toEqual({
      2: frames.filter((frame) => frame.tick >= resumed.tick).length - 1,
    });
  });

  it("renders nothing while paused and resumes on the first vsync", () => {
    const frames = runFakeAnimationFrames({
      refreshRate: 60,
      frameRate: 60,
      ticks: 120,
      isPaused: (tick) => tick >= 30 && tick < 60,
    });
    expect(frames.some((frame) => frame.tick >= 30 && frame.tick < 60)).toBe(false);
    expect(frames.find((frame) => frame.tick >= 60)).toEqual({ tick: 60, at: 2000, verdict: "on-time" });
  });

  it("estimates the display refresh from the frame clock", () => {
    const pacer = createArenaFramePacer();
    for (let tick = 0; tick < 30; tick += 1) {
      pacer.decideFrame({ now: tick * (1000 / 144), frameRate: 60, animating: true, paused: false });
    }
    expect(pacer.readVsyncMilliseconds()).toBeCloseTo(1000 / 144, 5);
  });
});
