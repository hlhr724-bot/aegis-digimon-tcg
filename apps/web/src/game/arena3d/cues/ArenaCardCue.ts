import type { ArenaCardChannelEntry } from "@/game/arena3d/cues/ArenaCardChannel";
import type { ArenaCardTintEntry } from "@/game/arena3d/cues/ArenaCardTint";

export type ArenaCardCue = {
  channel: ArenaCardChannelEntry | undefined;
  tint: ArenaCardTintEntry | undefined;
  shaking: boolean;
  landing: boolean;
  offered: boolean;
};

export type ArenaCardCueTimeline = {
  channelAt: number;
  sourceAt: number;
  tintAt: number;
  shakeAt: number;
  landingAt: number;
};

export type ArenaCardCueState = {
  cue: ArenaCardCue;
  timeline: ArenaCardCueTimeline;
};

export type ArenaFocus = {
  permanentId: string | undefined;
  level: number;
};
