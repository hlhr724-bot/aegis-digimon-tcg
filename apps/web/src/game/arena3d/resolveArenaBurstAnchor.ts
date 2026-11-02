import { ArenaZone } from "@/game/arena3d/ArenaZone";
import { findArenaZoneElement } from "@/game/arena3d/findArenaZoneElement";
import type { PermanentBurst } from "@/game/showcases";
import { Side } from "@/game/side";

type Params = {
  board: HTMLElement | null | undefined;
  burst: PermanentBurst;
  viewerSeat: number;
  element: HTMLElement | null | undefined;
};

export type ArenaBurstAnchor = {
  side: Side;
  anchor: HTMLElement | null;
};

export function resolveArenaBurstAnchor({ board, burst, viewerSeat, element }: Params): ArenaBurstAnchor {
  const side = burst.seat === viewerSeat ? Side.Viewer : Side.Opponent;
  if (element) {
    return { side, anchor: element };
  }
  if (!burst.inBreeding) {
    return { side, anchor: null };
  }
  return { side, anchor: findArenaZoneElement({ board, side, zone: ArenaZone.RAISING.value }) };
}
