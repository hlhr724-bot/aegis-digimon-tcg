import { describe, expect, it, vi } from "vitest";
import { LiveReplayAnnotator } from "#api/replays/annotations/LiveReplayAnnotator";
import type { ReplayAnnotationStore } from "#api/replays/annotations/ReplayAnnotationStore";
import { ReplayMarkerEmoji } from "@aegis/shared/replays/annotations/ReplayMarkerEmoji";

const MATCH_ID = "00000000-0000-4000-8000-000000000001";

function setup(recording = { id: MATCH_ID, frameCount: 8, exceededLimit: false }) {
  let now = 10_000;
  const addMarker = vi.fn<ReplayAnnotationStore["addMarker"]>(async (params) => ({
    kind: "added",
    marker: { id: "marker", createdAt: now, ...params } as never,
  }));
  const addNote = vi.fn<ReplayAnnotationStore["addNote"]>(async (params) => ({
    kind: "added",
    note: { id: "note", createdAt: now, updatedAt: now, ...params } as never,
  }));
  const annotator = new LiveReplayAnnotator({
    store: { addMarker, addNote },
    recording: () => recording,
    turn: () => 5,
    now: () => now,
  });
  return {
    annotator,
    addMarker,
    addNote,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const marker = { kind: "marker", emoji: ReplayMarkerEmoji.GREAT_PLAY.value };

describe("live replay markers", () => {
  it("stores the marker at the latest recorded frame and current turn", async () => {
    const { annotator, addMarker } = setup();
    const result = await annotator.handle({ authorId: "author", payload: marker });
    expect(result).toMatchObject({ kind: "marker", marker: { matchId: MATCH_ID, frameIndex: 7, turn: 5 } });
    expect(addMarker).toHaveBeenCalledWith(
      expect.objectContaining({ authorId: "author", matchId: MATCH_ID, frameIndex: 7, emoji: "🔥" }),
    );
  });

  it("stores a live text note at the same moment", async () => {
    const { annotator, addNote, addMarker } = setup();
    const result = await annotator.handle({ authorId: "author", payload: { kind: "note", text: " Bluff? " } });
    expect(result).toMatchObject({ kind: "note", note: { matchId: MATCH_ID, frameIndex: 7, turn: 5, text: "Bluff?" } });
    expect(addNote).toHaveBeenCalledTimes(1);
    expect(addMarker).not.toHaveBeenCalled();
  });

  it("refuses guests, invalid payloads and rapid repeats without touching storage", async () => {
    const { annotator, addMarker, advance } = setup();
    expect(await annotator.handle({ authorId: undefined, payload: marker })).toEqual({
      kind: "rejected",
      reason: "sign_in_required",
    });
    expect(await annotator.handle({ authorId: "author", payload: { kind: "marker", emoji: "ok" } })).toEqual({
      kind: "rejected",
      reason: "invalid",
    });
    await annotator.handle({ authorId: "author", payload: marker });
    expect(await annotator.handle({ authorId: "author", payload: marker })).toEqual({
      kind: "rejected",
      reason: "too_fast",
    });
    advance(1000);
    expect((await annotator.handle({ authorId: "author", payload: marker })).kind).toBe("marker");
    expect(addMarker).toHaveBeenCalledTimes(2);
  });

  it("refuses marking when the match has no usable recording", async () => {
    for (const recording of [
      { id: MATCH_ID, frameCount: 0, exceededLimit: false },
      { id: MATCH_ID, frameCount: 9, exceededLimit: true },
    ]) {
      const { annotator, addMarker } = setup(recording);
      expect(await annotator.handle({ authorId: "author", payload: marker })).toEqual({
        kind: "rejected",
        reason: "unavailable",
      });
      expect(addMarker).not.toHaveBeenCalled();
    }
  });
});
