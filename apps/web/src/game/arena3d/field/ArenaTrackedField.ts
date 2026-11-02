import type { ArenaCardCueState, ArenaFocus } from "@/game/arena3d/cues/ArenaCardCue";
import type { ArenaZone } from "@/game/arena3d/ArenaZone";
import type { ArenaRimEntry } from "@/game/arena3d/meshes/ArenaRim";
import type { Side } from "@/game/side";

export type ArenaCardPose = {
  x: number;
  z: number;
  width: number;
  yaw: number;
};

export type ArenaTrackedPermanent = {
  id: string;
  side: Side;
  top: ArenaCardPose;
  target: ArenaCardPose;
  slot: HTMLElement | undefined;
  sources: ArenaCardPose[];
  links: ArenaCardPose[];
  rim: ArenaRimEntry | undefined;
  hidden: boolean;
  opacity: number;
  cues: ArenaCardCueState;
};

export type ArenaTrackedZone = {
  key: string;
  side: Side;
  zone: ArenaZone;
  pose: ArenaCardPose;
  rim: ArenaRimEntry | undefined;
};

export type ArenaTrackedField = {
  permanents: Map<string, ArenaTrackedPermanent>;
  zones: Map<string, ArenaTrackedZone>;
  playDropSides: Set<Side>;
  focus: ArenaFocus;
};
