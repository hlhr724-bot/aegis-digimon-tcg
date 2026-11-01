import { ARENA_ROW_LAYOUT, type ArenaLaneLayout } from "@/game/arena3d/field/arenaWorldLayout";

export function getArenaColumnX(column: number, lanes: ArenaLaneLayout): number {
  return (column - (ARENA_ROW_LAYOUT.columns - 1) / 2) * lanes.columnPitch;
}
