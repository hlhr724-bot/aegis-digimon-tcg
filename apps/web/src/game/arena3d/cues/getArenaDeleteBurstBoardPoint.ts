import type { ScreenPoint } from "@/game/arena3d/ArenaPulse";
import type { DeleteBurst } from "@/game/match/types";

const FALLBACK_HALF_WIDTH = 36;
const FALLBACK_HALF_HEIGHT = 50.5;

export function getArenaDeleteBurstBoardPoint(burst: DeleteBurst): ScreenPoint {
  if (burst.face) {
    return { x: burst.face.x, y: burst.face.y };
  }
  return { x: burst.x + FALLBACK_HALF_WIDTH, y: burst.y + FALLBACK_HALF_HEIGHT };
}
