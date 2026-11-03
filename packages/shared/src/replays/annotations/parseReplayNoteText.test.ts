import { describe, expect, it } from "vitest";
import { parseLiveReplayAnnotationRequest } from "#shared/replays/annotations/parseLiveReplayAnnotationRequest";
import { parseReplayNoteText } from "#shared/replays/annotations/parseReplayNoteText";
import { REPLAY_NOTE_MAX_LENGTH } from "#shared/replays/annotations/replayAnnotationLimits";

describe("replay note text", () => {
  it("keeps line breaks but strips control and direction-override characters", () => {
    const override = String.fromCodePoint(0x202e);
    const bell = String.fromCodePoint(0x7);
    expect(parseReplayNoteText(`  Should have\r\n\r\n\r\n   blocked ${override}here${bell}  `)).toBe(
      "Should have\n\nblocked here",
    );
  });

  it("counts the limit in code points so emoji are not cut in half", () => {
    expect(parseReplayNoteText("🔥".repeat(REPLAY_NOTE_MAX_LENGTH))).toBe("🔥".repeat(REPLAY_NOTE_MAX_LENGTH));
    expect(parseReplayNoteText("a".repeat(REPLAY_NOTE_MAX_LENGTH + 1))).toBeUndefined();
  });

  it("refuses empty and non-text values", () => {
    for (const value of ["", "   \n  ", 42, null, undefined, ["note"]]) {
      expect(parseReplayNoteText(value)).toBeUndefined();
    }
  });

  it("accepts a live note request with clean text", () => {
    expect(parseLiveReplayAnnotationRequest({ kind: "note", text: " Misplay " })).toEqual({
      kind: "note",
      text: "Misplay",
    });
    expect(parseLiveReplayAnnotationRequest({ kind: "note", text: " " })).toBeUndefined();
  });
});
