import { describe, expect, it } from "vitest";
import { GuestApproval } from "@aegis/shared/protocol/GuestApproval";
import type { GameState } from "@aegis/shared/schema/GameState";
import { getGuestApprovalView } from "@/game/screen/model/getGuestApprovalView";

type ApprovalState = Pick<GameState, "guestApproval" | "players">;

function buildState(guestApproval: GameState["guestApproval"]): ApprovalState {
  return {
    guestApproval,
    players: [
      { sessionId: "host", displayName: "Streamer", avatarId: "greymon", connected: true },
      { sessionId: "guest", displayName: "Challenger", avatarId: "garurumon", connected: false },
    ],
  } as unknown as ApprovalState;
}

describe("guest approval view", () => {
  it("shows the board as usual when the room does not require approval", () => {
    expect(getGuestApprovalView({ state: buildState(GuestApproval.NOT_REQUIRED.value), sessionId: "host" })).toBe(
      undefined,
    );
  });

  it("shows the board once the host has accepted the guest", () => {
    expect(getGuestApprovalView({ state: buildState(GuestApproval.APPROVED.value), sessionId: "guest" })).toBe(
      undefined,
    );
  });

  it("lets the host review the pending guest's identity", () => {
    expect(getGuestApprovalView({ state: buildState(GuestApproval.PENDING.value), sessionId: "host" })).toEqual({
      kind: "hostReview",
      guest: { sessionId: "guest", displayName: "Challenger", avatarId: "garurumon", connected: false },
    });
  });

  it("tells the pending guest to wait for the host", () => {
    expect(getGuestApprovalView({ state: buildState(GuestApproval.PENDING.value), sessionId: "guest" })).toEqual({
      kind: "guestWaiting",
    });
  });

  it("keeps the host waiting after a declined guest leaves a stale seat behind", () => {
    expect(getGuestApprovalView({ state: buildState(GuestApproval.AWAITING_GUEST.value), sessionId: "host" })).toEqual({
      kind: "hostWaiting",
    });
  });
});
