import { describe, expect, it } from "vitest";
import { parseLiveReplayAnnotationRequest } from "#shared/replays/annotations/parseLiveReplayAnnotationRequest";
import { ReplayMarkerEmoji } from "#shared/replays/annotations/ReplayMarkerEmoji";

describe("live replay annotation requests", () => {
  it("accepts a marker with an allowed emoji", () => {
    expect(parseLiveReplayAnnotationRequest({ kind: "marker", emoji: ReplayMarkerEmoji.KEY_MOMENT.value })).toEqual({
      kind: "marker",
      emoji: ReplayMarkerEmoji.KEY_MOMENT.value,
    });
  });

  it("refuses emoji outside the allowlist and malformed payloads", () => {
    for (const payload of [
      { kind: "marker", emoji: "🤡" },
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
