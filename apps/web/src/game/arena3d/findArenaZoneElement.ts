import { ArenaZone } from "@/game/arena3d/ArenaZone";
import { Side } from "@/game/side";

type Params = {
  board: HTMLElement | null | undefined;
  side: Side;
  zone: ArenaZone;
};

export function findArenaZoneElement({ board, side, zone }: Params): HTMLElement | null {
  if (!board) {
    return null;
  }
  if (zone === ArenaZone.SECURITY.value) {
    return board.querySelector<HTMLElement>(`.game-security-shield--${side}`);
  }
  return board.querySelector<HTMLElement>(`[class*="game-utility-slot--${side}-${zone}"]`);
}
