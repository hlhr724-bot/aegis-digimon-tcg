import { describe, expect, it } from "vitest";
import type { MatchReplay } from "@aegis/shared/replays";
import { buildReplayAnnotationEntries } from "@/replays/annotations/buildReplayAnnotationEntries";
import { buildReplayChapters } from "@/replays/annotations/buildReplayChapters";

const MATCH_ID = "00000000-0000-4000-8000-000000000042";

function buildReplay(frameCount: number, gapMs: number): MatchReplay {
  return {
    frames: Array.from({ length: frameCount }, (_, index) => ({
      atMs: index * gapMs,
      state: { gameOver: false },
      events: [],
    })),
  } as unknown as MatchReplay;
}

function marker(frameIndex: number, emoji: "⭐" | "🔥") {
  return { id: `m${frameIndex}`, matchId: MATCH_ID, frameIndex, turn: 1, emoji, createdAt: frameIndex } as const;
}

function note(frameIndex: number, text: string) {
  return { id: `n${frameIndex}`, matchId: MATCH_ID, frameIndex, turn: 2, text, createdAt: frameIndex, updatedAt: 0 };
}

const describeEntry = (entry: ReturnType<typeof buildReplayAnnotationEntries>[number]) =>
  entry.kind === "marker" ? entry.marker.emoji : entry.note.text;

describe("YouTube chapter export", () => {
  it("starts at 0:00 and merges annotations closer than ten seconds to the previous chapter", () => {
    const entries = buildReplayAnnotationEntries({
      markers: [marker(2, "⭐"), marker(9, "🔥")],
      notes: [note(8, "Big swing")],
    });
    const chapters = buildReplayChapters({
      replay: buildReplay(40, 3000),
      entries,
      skipThinking: true,
      startLabel: "Start",
      describe: describeEntry,
    });
    expect(chapters).toBe(["0:00 Start · ⭐", "0:20 Big swing · 🔥"].join("\n"));
  });

  it("uses real thinking time when skipping is off and formats hours", () => {
    const chapters = buildReplayChapters({
      replay: buildReplay(3, 3_700_000),
      entries: buildReplayAnnotationEntries({ markers: [marker(1, "⭐")], notes: [] }),
      skipThinking: false,
      startLabel: "Start",
      describe: describeEntry,
    });
    expect(chapters).toBe(["0:00 Start", "1:01:40 ⭐"].join("\n"));
  });
});
