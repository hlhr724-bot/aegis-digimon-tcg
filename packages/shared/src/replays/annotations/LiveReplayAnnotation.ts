import type { LiveReplayAnnotationRejection } from "#shared/replays/annotations/LiveReplayAnnotationRejection";
import type { ReplayMarker } from "#shared/replays/annotations/ReplayMarker";
import type { ReplayMarkerEmoji } from "#shared/replays/annotations/ReplayMarkerEmoji";

export const LIVE_REPLAY_ANNOTATION_CHANNEL = "replayAnnotation";

export type LiveReplayAnnotationRequest = { kind: "marker"; emoji: ReplayMarkerEmoji };

export type LiveReplayAnnotationResult =
  | { kind: "marker"; marker: ReplayMarker }
  | { kind: "rejected"; reason: LiveReplayAnnotationRejection };
