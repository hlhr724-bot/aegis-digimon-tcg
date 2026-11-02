import { isReplayMarkerEmoji } from "#shared/replays/annotations/isReplayMarkerEmoji";
import type { LiveReplayAnnotationRequest } from "#shared/replays/annotations/LiveReplayAnnotation";
import { parseReplayNoteText } from "#shared/replays/annotations/parseReplayNoteText";

export function parseLiveReplayAnnotationRequest(payload: unknown): LiveReplayAnnotationRequest | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const value = payload as Record<string, unknown>;
  if (value.kind === "marker" && isReplayMarkerEmoji(value.emoji)) {
    return { kind: "marker", emoji: value.emoji };
  }
  if (value.kind === "note") {
    const text = parseReplayNoteText(value.text);
    return text === undefined ? undefined : { kind: "note", text };
  }
  return undefined;
}
