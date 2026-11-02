import type { LiveReplayAnnotationRejection } from "#shared/replays/annotations/LiveReplayAnnotationRejection";
import type { ReplayMarker } from "#shared/replays/annotations/ReplayMarker";
import type { ReplayMarkerEmoji } from "#shared/replays/annotations/ReplayMarkerEmoji";
import type { ReplayNote } from "#shared/replays/annotations/ReplayNote";

export const LIVE_REPLAY_ANNOTATION_CHANNEL = "replayAnnotation";

export type LiveReplayAnnotationRequest = { kind: "marker"; emoji: ReplayMarkerEmoji } | { kind: "note"; text: string };

export type LiveReplayAnnotationResult =
  | { kind: "marker"; marker: ReplayMarker }
  | { kind: "note"; note: ReplayNote }
  | { kind: "rejected"; reason: LiveReplayAnnotationRejection };
