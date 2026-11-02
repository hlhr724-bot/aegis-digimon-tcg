import type { ArenaCardCueState, ArenaFocus } from "@/game/arena3d/cues/ArenaCardCue";
import { ArenaCuePace } from "@/game/arena3d/cues/ArenaCuePace";
import { ARENA_CUE_TIMING } from "@/game/arena3d/cues/arenaCueTiming";

type CuedPermanent = {
  cues: ArenaCardCueState;
};

type Params = {
  permanents: Iterable<CuedPermanent>;
  focus: ArenaFocus;
  time: number;
  reducedMotion: boolean;
};

type WindowParams = {
  time: number;
  startedAt: number;
  seconds: number;
};

const SETTLED_FOCUS_LEVEL = 0.998;
const CHANNEL_SECONDS = Math.max(ARENA_CUE_TIMING.liftRiseSeconds, ARENA_CUE_TIMING.channelRiseSeconds);
const SOURCE_SECONDS = Math.max(ARENA_CUE_TIMING.flashSeconds, ARENA_CUE_TIMING.sourceSwellSeconds);
const LANDING_SECONDS = Math.max(
  ARENA_CUE_TIMING.materializeSeconds + ARENA_CUE_TIMING.sweepSeconds,
  ARENA_CUE_TIMING.arrivalSeconds,
);

function isWithin({ time, startedAt, seconds }: WindowParams): boolean {
  const age = time - startedAt;
  return age >= 0 && age <= seconds;
}

function isCueChanging(state: ArenaCardCueState, time: number): boolean {
  const { timeline } = state;
  return (
    isWithin({ time, startedAt: timeline.channelAt, seconds: CHANNEL_SECONDS }) ||
    isWithin({ time, startedAt: timeline.sourceAt, seconds: SOURCE_SECONDS }) ||
    isWithin({ time, startedAt: timeline.tintAt, seconds: ARENA_CUE_TIMING.tintSeconds }) ||
    isWithin({ time, startedAt: timeline.shakeAt, seconds: ARENA_CUE_TIMING.shakeSeconds }) ||
    isWithin({ time, startedAt: timeline.landingAt, seconds: LANDING_SECONDS })
  );
}

export function resolveArenaCuePace({ permanents, focus, time, reducedMotion }: Params): ArenaCuePace {
  if (focus.level > 0 && focus.level < SETTLED_FOCUS_LEVEL) {
    return ArenaCuePace.TRANSITION.value;
  }
  if (reducedMotion) {
    return ArenaCuePace.IDLE.value;
  }
  let settled = false;
  for (const { cues } of permanents) {
    if (isCueChanging(cues, time)) {
      return ArenaCuePace.TRANSITION.value;
    }
    settled ||= cues.cue.channel !== undefined;
  }
  return settled ? ArenaCuePace.SETTLED.value : ArenaCuePace.IDLE.value;
}
