import { CARD_DIMENSIONS } from "@/design/webglCard/cardDimensions";
import { ARENA_ROW_LAYOUT, type ArenaLaneLayout } from "@/game/arena3d/field/arenaWorldLayout";
import type { ArenaSlotGrid } from "@/game/arena3d/slots/ArenaSlotGrid";

const CARD_DEPTH = ARENA_ROW_LAYOUT.cardWidth * CARD_DIMENSIONS.height;

export function measureArenaSlotGrid(lanes: ArenaLaneLayout): ArenaSlotGrid {
  const near = lanes.digimonDepth - CARD_DEPTH / 2;
  const far = lanes.supportDepth + CARD_DEPTH / 2;
  return {
    halfWidth: ((ARENA_ROW_LAYOUT.columns - 1) / 2) * lanes.columnPitch + ARENA_ROW_LAYOUT.cardWidth / 2,
    halfDepth: (far - near) / 2,
    centerDepth: (near + far) / 2,
  };
}
