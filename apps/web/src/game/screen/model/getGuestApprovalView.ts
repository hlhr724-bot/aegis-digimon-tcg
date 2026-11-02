import { GuestApproval } from "@aegis/shared/protocol/GuestApproval";
import type { GameState } from "@aegis/shared/schema/GameState";

export type GuestApprovalRequest = {
  sessionId: string;
  displayName: string;
  avatarId: string;
  connected: boolean;
};

export type GuestApprovalView =
  | { kind: "hostWaiting" }
  | { kind: "hostReview"; guest: GuestApprovalRequest }
  | { kind: "guestWaiting" };

type Params = {
  state: Pick<GameState, "guestApproval" | "players"> | undefined;
  sessionId: string | undefined;
};

export function getGuestApprovalView({ state, sessionId }: Params): GuestApprovalView | undefined {
  const entry = Object.values(GuestApproval).find((candidate) => candidate.value === state?.guestApproval);
  if (!state || !entry?.holdsMatchBoard) {
    return undefined;
  }
  const [host, guest] = [state.players[0], state.players[1]];
  if (!sessionId || host?.sessionId !== sessionId) {
    return { kind: "guestWaiting" };
  }
  if (entry.value === GuestApproval.PENDING.value && guest?.sessionId) {
    return {
      kind: "hostReview",
      guest: {
        sessionId: guest.sessionId,
        displayName: guest.displayName,
        avatarId: guest.avatarId,
        connected: guest.connected,
      },
    };
  }
  return { kind: "hostWaiting" };
}
