import { ArenaFrameVerdict } from "@/game/arena3d/ArenaFrameVerdict";

type DecideParams = {
  now: number;
  frameRate: number;
  animating: boolean;
  paused: boolean;
};

export type ArenaFramePacer = {
  decideFrame: (params: DecideParams) => ArenaFrameVerdict;
  readVsyncMilliseconds: () => number;
};

const VSYNC_SAMPLES = 15;
const DEFAULT_VSYNC_MILLISECONDS = 1000 / 60;
const STALL_MILLISECONDS = 250;
const STATIC_FRAME_RATE = 10;

function getStride(frameRate: number, vsyncMilliseconds: number): number {
  return Math.max(1, Math.round(1000 / frameRate / vsyncMilliseconds));
}

function getStaticStride(frameRate: number, vsyncMilliseconds: number): number {
  return getStride(frameRate, vsyncMilliseconds) * Math.max(1, Math.round(frameRate / STATIC_FRAME_RATE));
}

export function createArenaFramePacer(): ArenaFramePacer {
  const samples = new Float64Array(VSYNC_SAMPLES);
  const sorted = new Float64Array(VSYNC_SAMPLES);
  let sampleCount = 0;
  let sampleIndex = 0;
  let vsyncMilliseconds = DEFAULT_VSYNC_MILLISECONDS;
  let previousTick: number | undefined;
  let lastRender: number | undefined;
  let lastRenderAnimated = false;

  function recordTick(now: number) {
    const delta = previousTick === undefined ? 0 : now - previousTick;
    previousTick = now;
    if (delta <= 0 || delta >= STALL_MILLISECONDS) {
      return;
    }
    samples[sampleIndex] = delta;
    sampleIndex = (sampleIndex + 1) % VSYNC_SAMPLES;
    sampleCount = Math.min(VSYNC_SAMPLES, sampleCount + 1);
    sorted.set(samples);
    sorted.fill(Number.POSITIVE_INFINITY, sampleCount);
    sorted.sort();
    vsyncMilliseconds = sorted[Math.floor(sampleCount / 2)]!;
  }

  function decideFrame({ now, frameRate, animating, paused }: DecideParams): ArenaFrameVerdict {
    recordTick(now);
    if (paused) {
      lastRender = undefined;
      return ArenaFrameVerdict.SKIP.value;
    }
    const stride = animating ? getStride(frameRate, vsyncMilliseconds) : getStaticStride(frameRate, vsyncMilliseconds);
    const gap = lastRender === undefined ? Number.POSITIVE_INFINITY : now - lastRender;
    const elapsed = Math.round(gap / vsyncMilliseconds);
    if (elapsed < stride) {
      return ArenaFrameVerdict.SKIP.value;
    }
    const late = animating && lastRenderAnimated && elapsed > stride && gap < STALL_MILLISECONDS;
    lastRender = now;
    lastRenderAnimated = animating;
    return late ? ArenaFrameVerdict.LATE.value : ArenaFrameVerdict.ON_TIME.value;
  }

  return { decideFrame, readVsyncMilliseconds: () => vsyncMilliseconds };
}
