import type { ArenaCardCueState } from "@/game/arena3d/cues/ArenaCardCue";
import type { ArenaCueDecal } from "@/game/arena3d/cues/ArenaCueDecal";
import { ArenaCueDecalKind } from "@/game/arena3d/cues/ArenaCueDecalKind";
import { ARENA_CUE_TIMING } from "@/game/arena3d/cues/arenaCueTiming";
import type { ArenaCardPose } from "@/game/arena3d/field/ArenaTrackedField";

type CuedPermanent = {
  top: ArenaCardPose;
  hidden: boolean;
  opacity: number;
  cues: ArenaCardCueState;
};

type Params = {
  permanents: Iterable<CuedPermanent>;
  time: number;
  reducedMotion: boolean;
  arrivalColor: string;
  summoningColor: string;
};

function getProgress(age: number, durationSeconds: number): number | undefined {
  if (age < 0 || age > durationSeconds) {
    return undefined;
  }
  return age / durationSeconds;
}

function getChannelRise(age: number, reducedMotion: boolean): number {
  if (reducedMotion) {
    return 1;
  }
  return Math.min(1, Math.max(0, age / ARENA_CUE_TIMING.channelRiseSeconds));
}

function getSourceSwell(age: number, reducedMotion: boolean): number {
  if (reducedMotion || age < 0 || age > ARENA_CUE_TIMING.sourceSwellSeconds) {
    return 0;
  }
  return Math.sin((age / ARENA_CUE_TIMING.sourceSwellSeconds) * Math.PI) * 0.35;
}

export function collectArenaCueDecals({
  permanents,
  time,
  reducedMotion,
  arrivalColor,
  summoningColor,
}: Params): ArenaCueDecal[] {
  const decals: ArenaCueDecal[] = [];
  for (const permanent of permanents) {
    if (permanent.hidden || permanent.opacity <= 0.05) {
      continue;
    }
    const { cue, timeline } = permanent.cues;
    const base = { x: permanent.top.x, z: permanent.top.z, width: permanent.top.width, yaw: permanent.top.yaw };
    if (cue.summoning) {
      decals.push({ ...base, kind: ArenaCueDecalKind.SUMMONING, color: summoningColor, progress: 1, strength: 1 });
    }
    if (cue.channel) {
      const rise = getChannelRise(time - timeline.channelAt, reducedMotion);
      const swell = getSourceSwell(time - timeline.sourceAt, reducedMotion);
      decals.push({
        ...base,
        kind: ArenaCueDecalKind.CHANNEL,
        color: cue.channel.color,
        progress: rise,
        strength: cue.channel.strength * rise + swell,
      });
      decals.push({
        ...base,
        kind: ArenaCueDecalKind.COLUMN,
        color: cue.channel.color,
        progress: rise,
        strength: cue.channel.column * rise + swell,
      });
    }
    const tintProgress = reducedMotion ? undefined : getProgress(time - timeline.tintAt, ARENA_CUE_TIMING.tintSeconds);
    if (cue.tint && tintProgress !== undefined) {
      decals.push({
        ...base,
        kind: ArenaCueDecalKind.TINT,
        color: cue.tint.color,
        progress: tintProgress,
        strength: 1,
      });
    }
    const arrivalProgress = reducedMotion
      ? undefined
      : getProgress(time - timeline.landingAt, ARENA_CUE_TIMING.arrivalSeconds);
    if (arrivalProgress !== undefined) {
      decals.push({
        ...base,
        kind: ArenaCueDecalKind.ARRIVAL,
        color: arrivalColor,
        progress: arrivalProgress,
        strength: 1,
      });
    }
  }
  return decals;
}
