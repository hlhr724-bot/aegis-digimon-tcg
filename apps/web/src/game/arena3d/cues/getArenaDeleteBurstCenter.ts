import type { ScreenPoint } from "@/game/arena3d/ArenaPulse";
import type { DeleteBurst } from "@/game/match/types";

type Params = {
  board: HTMLElement | null;
  burst: DeleteBurst;
};

const FALLBACK_HALF_WIDTH = 36;
const FALLBACK_HALF_HEIGHT = 50.5;

export function getArenaDeleteBurstCenter({ board, burst }: Params): ScreenPoint | undefined {
  if (!board) {
    return undefined;
  }
  const rect = board.getBoundingClientRect();
  if (burst.face) {
    return { x: rect.left + burst.face.x, y: rect.top + burst.face.y };
  }
  return { x: rect.left + burst.x + FALLBACK_HALF_WIDTH, y: rect.top + burst.y + FALLBACK_HALF_HEIGHT };
}
