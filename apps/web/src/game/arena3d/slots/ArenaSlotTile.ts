import type { ArenaSlotTileKind } from "@/game/arena3d/slots/ArenaSlotTileKind";
import type { Side } from "@/game/side";

export type ArenaSlotTile = {
  side: Side;
  kind: ArenaSlotTileKind;
  x: number;
  z: number;
  width: number;
  depth: number;
};
