import { describe, expect, it } from "vitest";
import type { MatchReplay, ServerEvent } from "@aegis/shared";
import { frameDelay, presentationEnd } from "./playback";

const optionId = "option-card";
const optionPlayed = {
  kind: "cardPlayed",
  instanceId: optionId,
  fromZone: "hand",
  seat: 1,
  cardId: "ST23-15",
} as ServerEvent;
const optionRouted = {
  kind: "cardsMoved",
  instanceIds: [optionId],
  from: "resolvingOption",
  fromSeat: 1,
  to: "trash",
  optionUsed: true,
} as ServerEvent;
const turnEnded: ServerEvent = { kind: "turnEnded", endingSeat: 1, nextSeat: 0, turnCount: 3 };

function replayOf(frames: ServerEvent[][]): MatchReplay {
  return {
    frames: frames.map((events, index) => ({ atMs: index * 1000, state: { gameOver: false }, events })),
  } as unknown as MatchReplay;
}

describe("presentationEnd", () => {
  it("keeps a used Option's frames together until the server routes the card", () => {
    const replay = replayOf([[], [optionPlayed], [], [optionRouted], []]);

    expect(presentationEnd(replay, 1)).toBe(3);
  });

  it("closes an Option span the server never routes at the end of the turn", () => {
    const replay = replayOf([[optionPlayed], [], [turnEnded], [], []]);

    expect(presentationEnd(replay, 0)).toBe(2);
  });
});

it("skips thinking gaps by default, can retain them, and applies playback speed without altering frames", () => {
  const replay = replayOf([[], []]);
  replay.frames[1]!.atMs = 90_000;
  expect(frameDelay(replay, 0, 1)).toBe(2500);
  expect(frameDelay(replay, 0, 2)).toBe(1250);
  expect(frameDelay(replay, 0, 1, false)).toBe(90_000);
  expect(replay.frames[1]!.atMs).toBe(90_000);
});
