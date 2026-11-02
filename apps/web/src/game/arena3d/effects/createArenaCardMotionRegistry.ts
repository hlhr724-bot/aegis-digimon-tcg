import {
  ArenaCardMotionKind,
  type ArenaCardMotionKindEntry,
  type ArenaMotionKeyframe,
} from "@/game/arena3d/effects/ArenaCardMotionKind";

export type ArenaCardMotion = {
  permanentId: string;
  kind: ArenaCardMotionKindEntry;
  startedAt: number;
  directionX: number;
  directionZ: number;
  distance: number;
};

export type ArenaCardMotionSample = {
  offsetX: number;
  offsetZ: number;
  lift: number;
  tilt: number;
  roll: number;
  spin: number;
  scale: number;
  flash: number;
};

export type ArenaCardMotionRegistry = {
  add: (motion: ArenaCardMotion) => void;
  sample: (permanentId: string, time: number, target: ArenaCardMotionSample) => boolean;
  isBusy: (time: number) => boolean;
};

function easeInOut(value: number): number {
  return value * value * (3 - 2 * value);
}

type InterpolateParams = {
  keyframes: readonly ArenaMotionKeyframe[];
  progress: number;
  target: ArenaMotionKeyframe;
};

function interpolate({ keyframes, progress, target }: InterpolateParams): ArenaMotionKeyframe {
  for (let index = 1; index < keyframes.length; index += 1) {
    const next = keyframes[index]!;
    if (progress <= next.at) {
      const previous = keyframes[index - 1]!;
      const span = Math.max(0.0001, next.at - previous.at);
      const local = easeInOut(Math.min(1, Math.max(0, (progress - previous.at) / span)));
      target.at = progress;
      target.along = previous.along + (next.along - previous.along) * local;
      target.lift = previous.lift + (next.lift - previous.lift) * local;
      target.tilt = previous.tilt + (next.tilt - previous.tilt) * local;
      target.roll = previous.roll + (next.roll - previous.roll) * local;
      target.spin = previous.spin + (next.spin - previous.spin) * local;
      target.scale = previous.scale + (next.scale - previous.scale) * local;
      target.flash = previous.flash + (next.flash - previous.flash) * local;
      return target;
    }
  }
  return keyframes[keyframes.length - 1]!;
}

function resetSample(target: ArenaCardMotionSample) {
  target.offsetX = 0;
  target.offsetZ = 0;
  target.lift = 0;
  target.tilt = 0;
  target.roll = 0;
  target.spin = 0;
  target.scale = 1;
  target.flash = 0;
}

export function createArenaCardMotionRegistry(): ArenaCardMotionRegistry {
  const motions = new Map<string, ArenaCardMotion[]>();
  const keyframe: ArenaMotionKeyframe = { at: 0, along: 0, lift: 0, tilt: 0, roll: 0, spin: 0, scale: 1, flash: 0 };
  let busyUntil = 0;

  return {
    add(motion) {
      const list = motions.get(motion.permanentId) ?? [];
      list.push(motion);
      motions.set(motion.permanentId, list);
      busyUntil = Math.max(busyUntil, motion.startedAt + motion.kind.delaySeconds + motion.kind.durationSeconds);
    },
    sample(permanentId, time, target) {
      resetSample(target);
      const list = motions.get(permanentId);
      if (!list) {
        return false;
      }
      let active = false;
      let kept = 0;
      for (const motion of list) {
        const age = time - motion.startedAt - motion.kind.delaySeconds;
        const end = motion.kind.durationSeconds;
        if (age > end) {
          continue;
        }
        list[kept] = motion;
        kept += 1;
        if (age < 0 && motion.kind.value !== ArenaCardMotionKind.DROP.value) {
          continue;
        }
        const values = interpolate({
          keyframes: motion.kind.keyframes,
          progress: Math.max(0, age) / end,
          target: keyframe,
        });
        target.offsetX += motion.directionX * motion.distance * values.along;
        target.offsetZ += motion.directionZ * motion.distance * values.along;
        target.lift += values.lift;
        target.tilt += values.tilt;
        target.roll += values.roll;
        target.spin += values.spin;
        target.scale *= values.scale;
        target.flash = Math.max(target.flash, values.flash);
        active = true;
      }
      list.length = kept;
      if (kept === 0) {
        motions.delete(permanentId);
      }
      return active;
    },
    isBusy(time) {
      return time < busyUntil;
    },
  };
}
