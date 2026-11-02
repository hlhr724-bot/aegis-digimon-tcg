import type { ReplayMarker } from "#shared/replays/annotations/ReplayMarker";

export type ReplayAnnotations = {
  markers: ReplayMarker[];
  canAnnotate: boolean;
};
