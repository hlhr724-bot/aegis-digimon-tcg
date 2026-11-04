import { describe, expect, it } from "vitest";
import { parseLiveReplayAnnotationRequest } from "#shared/replays/annotations/parseLiveReplayAnnotationRequest";
import { ReplayMarkerEmoji } from "#shared/replays/annotations/ReplayMarkerEmoji";

describe("live replay annotation requests", () => {
  it("accepts a marker with a preset or any other single emoji", () => {
    for (const emoji of [ReplayMarkerEmoji.KEY_MOMENT.value, "🤡"]) {
      expect(parseLiveReplayAnnotationRequest({ kind: "marker", emoji })).toEqual({ kind: "marker", emoji });
    }
  });

  it("refuses text, several emoji and malformed payloads", () => {
    for (const payload of [
      { kind: "marker", emoji: "⭐⭐" },
      { kind: "marker", emoji: "constructor" },
      { kind: "marker" },
      { kind: "unknown", emoji: ReplayMarkerEmoji.IDEA.value },
      [],
      null,
      "⭐",
    ]) {
      expect(parseLiveReplayAnnotationRequest(payload)).toBeUndefined();
    }
  });
});
