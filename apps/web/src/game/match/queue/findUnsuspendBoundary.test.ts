import { describe, expect, it } from "vitest";
import type { ServerEvent } from "@aegis/shared";
import { findUnsuspendBoundary } from "./findUnsuspendBoundary";

const active: ServerEvent = { kind: "phaseChanged", phase: "Active", turnSeat: 0, turnCount: 3 };
const startOfTurnPlay: ServerEvent = {
  kind: "cardsMoved",
  from: "hand",
  to: "battleArea",
  instanceIds: ["aegiomon"],
};
const unsuspend: ServerEvent = { kind: "cardsMoved", from: "suspended", to: "unsuspended", instanceIds: ["inori"] };
const draw: ServerEvent = { kind: "phaseChanged", phase: "Draw", turnSeat: 0, turnCount: 3 };

describe("findUnsuspendBoundary", () => {
  it("waits while Start of Turn effects are still resolving", () => {
    expect(findUnsuspendBoundary({ activePhase: active, eventTimeline: [active, startOfTurnPlay] })).toBe("pending");
  });

  it("places the Unsuspend ribbon after Start of Turn effects, at the first unsuspend", () => {
    expect(
      findUnsuspendBoundary({ activePhase: active, eventTimeline: [active, startOfTurnPlay, unsuspend, draw] }),
    ).toBe(unsuspend);
  });

  it("uses the next phase when nothing unsuspends", () => {
    expect(findUnsuspendBoundary({ activePhase: active, eventTimeline: [active, startOfTurnPlay, draw] })).toBe(draw);
  });

  it("skips the Unsuspend ribbon when the turn ends during Start of Turn", () => {
    const turnEnded: ServerEvent = { kind: "turnEnded", endingSeat: 0, nextSeat: 1, turnCount: 3 };
    expect(findUnsuspendBoundary({ activePhase: active, eventTimeline: [active, turnEnded] })).toBe("skipped");
  });
});
