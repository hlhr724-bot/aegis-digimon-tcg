import { CARD_DIMENSIONS } from "@/design/webglCard/cardDimensions";
import { ArenaZone } from "@/game/arena3d/ArenaZone";
import type { ArenaBreedingSpot, ArenaBreedingSpotlight } from "@/game/arena3d/breeding/ArenaBreedingSpot";
import type { ArenaLayoutVariantEntry } from "@/game/arena3d/field/ArenaLayoutVariant";
import { ARENA_PILE_CARD_WIDTH, ARENA_ROW_LAYOUT, type ArenaZonePoint } from "@/game/arena3d/field/arenaWorldLayout";
import { Side } from "@/game/side";

type SpotParams = {
  point: ArenaZonePoint | undefined;
  cardWidth: number;
};

const SPOT_PADDING = 0.1;

function buildSpot({ point, cardWidth }: SpotParams): ArenaBreedingSpot {
  return {
    x: point?.x ?? 0,
    z: point?.z ?? 0,
    halfWidth: cardWidth / 2 + SPOT_PADDING,
    halfDepth: (cardWidth * CARD_DIMENSIONS.height) / 2 + SPOT_PADDING,
  };
}

export function computeArenaBreedingSpotlight(layout: ArenaLayoutVariantEntry): ArenaBreedingSpotlight {
  return {
    eggs: buildSpot({
      point: layout.zones[`${Side.Viewer}:${ArenaZone.EGGS.value}`],
      cardWidth: ARENA_PILE_CARD_WIDTH,
    }),
    raising: buildSpot({
      point: layout.zones[`${Side.Viewer}:${ArenaZone.RAISING.value}`],
      cardWidth: ARENA_ROW_LAYOUT.cardWidth,
    }),
  };
}
