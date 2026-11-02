import { ArenaCardChannel } from "@/game/arena3d/cues/ArenaCardChannel";
import type { ArenaCardCue, ArenaCardCueState } from "@/game/arena3d/cues/ArenaCardCue";

type Params = {
  previous: ArenaCardCueState;
  cue: ArenaCardCue;
  time: number;
};

function startIf(rising: boolean, previousAt: number, time: number): number {
  return rising ? time : previousAt;
}

export function advanceArenaCardCueState({ previous, cue, time }: Params): ArenaCardCueState {
  const before = previous.cue;
  const timeline = previous.timeline;
  const sourceRising =
    cue.channel?.value === ArenaCardChannel.SOURCE.value && before.channel?.value !== ArenaCardChannel.SOURCE.value;
  return {
    cue,
    timeline: {
      channelAt: startIf(cue.channel !== undefined && before.channel === undefined, timeline.channelAt, time),
      sourceAt: startIf(sourceRising, timeline.sourceAt, time),
      tintAt: startIf(cue.tint !== undefined && cue.tint.value !== before.tint?.value, timeline.tintAt, time),
      shakeAt: startIf(cue.shaking && !before.shaking, timeline.shakeAt, time),
      landingAt: startIf(cue.landing && !before.landing, timeline.landingAt, time),
    },
  };
}
