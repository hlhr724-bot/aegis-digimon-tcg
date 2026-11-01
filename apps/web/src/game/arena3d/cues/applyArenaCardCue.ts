import type { ArenaCardCueState, ArenaFocus } from "@/game/arena3d/cues/ArenaCardCue";
import type { ArenaCardCueLook } from "@/game/arena3d/cues/ArenaCardCueLook";
import { ARENA_CUE_TIMING } from "@/game/arena3d/cues/arenaCueTiming";
import type { ArenaCardMotionSample } from "@/game/arena3d/effects/createArenaCardMotionRegistry";

type Params = {
  sample: ArenaCardMotionSample;
  permanentId: string;
  state: ArenaCardCueState;
  focus: ArenaFocus;
  time: number;
  reducedMotion: boolean;
};

function smooth(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function getBump(age: number, durationSeconds: number): number {
  if (age < 0 || age > durationSeconds) {
    return 0;
  }
  return Math.sin((age / durationSeconds) * Math.PI);
}

function getTintStrength(age: number, reducedMotion: boolean): number {
  if (reducedMotion) {
    return ARENA_CUE_TIMING.steadyTintStrength;
  }
  return ARENA_CUE_TIMING.tintStrength * getBump(age, ARENA_CUE_TIMING.tintSeconds);
}

const MATERIALIZE_RESTING = 1.6;
const SWEEP_RANGE = 0.6;

function getMaterialize(age: number, reducedMotion: boolean): number {
  if (reducedMotion || age < 0) {
    return MATERIALIZE_RESTING;
  }
  if (age < ARENA_CUE_TIMING.materializeSeconds) {
    return age / ARENA_CUE_TIMING.materializeSeconds;
  }
  const sweepAge = age - ARENA_CUE_TIMING.materializeSeconds;
  if (sweepAge < ARENA_CUE_TIMING.sweepSeconds) {
    return 1 + (sweepAge / ARENA_CUE_TIMING.sweepSeconds) * SWEEP_RANGE;
  }
  return MATERIALIZE_RESTING;
}

export function applyArenaCardCue({
  sample,
  permanentId,
  state,
  focus,
  time,
  reducedMotion,
}: Params): ArenaCardCueLook {
  const { cue, timeline } = state;
  if (cue.channel && !reducedMotion) {
    sample.lift += cue.channel.lift * smooth((time - timeline.channelAt) / ARENA_CUE_TIMING.liftRiseSeconds);
  }
  if (!reducedMotion) {
    const flash = ARENA_CUE_TIMING.flashStrength * getBump(time - timeline.sourceAt, ARENA_CUE_TIMING.flashSeconds);
    sample.flash = Math.max(sample.flash, flash);
    const shakeAge = time - timeline.shakeAt;
    if (shakeAge >= 0 && shakeAge < ARENA_CUE_TIMING.shakeSeconds) {
      const decay = 1 - shakeAge / ARENA_CUE_TIMING.shakeSeconds;
      sample.offsetX += Math.sin(shakeAge * 95) * ARENA_CUE_TIMING.shakeAmplitude * decay;
      sample.offsetZ += Math.cos(shakeAge * 73) * ARENA_CUE_TIMING.shakeAmplitude * 0.6 * decay;
    }
  }
  const dimmed = focus.level > 0 && focus.permanentId !== undefined && focus.permanentId !== permanentId;
  return {
    shade: dimmed ? 1 - ARENA_CUE_TIMING.focusDim * focus.level : 1,
    tintColor: cue.tint?.color,
    tintStrength: cue.tint ? getTintStrength(time - timeline.tintAt, reducedMotion) : 0,
    materialize: getMaterialize(time - timeline.landingAt, reducedMotion),
  };
}
