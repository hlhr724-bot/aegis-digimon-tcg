import { describe, expect, it } from "vitest";
import type { GameState } from "@aegis/shared/schema/GameState";
import { isMatchIntroStarting } from "@/game/screen/model/isMatchIntroStarting";

function buildState(overrides: Partial<Pick<GameState, "turnCount" | "gameOver">> = {}): GameState {
  return {
    turnCount: 0,
    gameOver: false,
    players: [{ sessionId: "host" }, { sessionId: "guest" }],
    ...overrides,
  } as unknown as GameState;
}

describe("match intro start", () => {
  it("starts once both seats are filled before the first turn", () => {
    expect(isMatchIntroStarting({ status: "connected", state: buildState(), guestApproval: undefined })).toBe(true);
  });

  it("waits while the host still reviews the seated guest", () => {
    expect(
      isMatchIntroStarting({
        status: "connected",
        state: buildState(),
        guestApproval: {
          kind: "hostReview",
          guest: { sessionId: "guest", displayName: "Challenger", avatarId: "garurumon", connected: true },
        },
      }),
    ).toBe(false);
  });

  it("waits while the seated guest awaits the host's answer", () => {
    expect(
      isMatchIntroStarting({ status: "connected", state: buildState(), guestApproval: { kind: "guestWaiting" } }),
    ).toBe(false);
  });

  it("does not start once the match has begun", () => {
    expect(
      isMatchIntroStarting({ status: "connected", state: buildState({ turnCount: 1 }), guestApproval: undefined }),
    ).toBe(false);
  });
});
