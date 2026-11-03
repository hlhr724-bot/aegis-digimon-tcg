import type { ReplayMarker } from "#shared/replays/annotations/ReplayMarker";
import type { ReplayNote } from "#shared/replays/annotations/ReplayNote";

export type ReplayAnnotations = {
  markers: ReplayMarker[];
  notes: ReplayNote[];
  canAnnotate: boolean;
  ownReplayIds: string[];
};
