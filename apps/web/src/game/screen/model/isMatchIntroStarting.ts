import type { GameState } from "@aegis/shared/schema/GameState";
import { bothSeated } from "@/game/boardModel";
import type { GuestApprovalView } from "@/game/screen/model/getGuestApprovalView";

type Params = {
  status: string;
  state: GameState | undefined;
  guestApproval: GuestApprovalView | undefined;
};

export function isMatchIntroStarting({ status, state, guestApproval }: Params): boolean {
  return (
    status === "connected" &&
    state !== undefined &&
    bothSeated(state) &&
    state.turnCount === 0 &&
    !state.gameOver &&
    guestApproval === undefined
  );
}
