import type { ReplayMarker } from "#shared/replays/annotations/ReplayMarker";
import type { ReplayNote } from "#shared/replays/annotations/ReplayNote";
import type { ReplayVisibility } from "#shared/replays/ReplayVisibility";

export type SharedReplayAnnotations = {
  authorName: string;
  markers: ReplayMarker[];
  notes: ReplayNote[];
};

export type OwnReplayAnnotationSharing = {
  replayId: string;
  visibility: ReplayVisibility;
  annotationsShared: boolean;
};

export type ReplayAnnotations = {
  markers: ReplayMarker[];
  notes: ReplayNote[];
  canAnnotate: boolean;
  shared: SharedReplayAnnotations[];
  ownReplays: OwnReplayAnnotationSharing[];
};
