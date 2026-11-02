import type { ArenaCardCueState } from "@/game/arena3d/cues/ArenaCardCue";

export function createArenaCardCueState(): ArenaCardCueState {
  return {
    cue: { channel: undefined, tint: undefined, shaking: false, landing: false, offered: false },
    timeline: {
      channelAt: Number.NEGATIVE_INFINITY,
      sourceAt: Number.NEGATIVE_INFINITY,
      tintAt: Number.NEGATIVE_INFINITY,
      shakeAt: Number.NEGATIVE_INFINITY,
      landingAt: Number.NEGATIVE_INFINITY,
    },
  };
}
