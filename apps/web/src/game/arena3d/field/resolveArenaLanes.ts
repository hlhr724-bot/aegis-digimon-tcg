import { BattleLanes } from "@/design/battleLanes";
import type { ArenaLaneLayout } from "@/game/arena3d/field/arenaWorldLayout";

export function resolveArenaLanes(lanes: ArenaLaneLayout, count: BattleLanes): ArenaLaneLayout {
  if (count === BattleLanes.Two) {
    return lanes;
  }
  const depth = (lanes.digimonDepth + lanes.supportDepth) / 2;
  return { ...lanes, count: BattleLanes.One, digimonDepth: depth, supportDepth: depth };
}
