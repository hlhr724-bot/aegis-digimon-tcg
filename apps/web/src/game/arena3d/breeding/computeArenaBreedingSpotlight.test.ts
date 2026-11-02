import { describe, expect, it } from "vitest";
import { CARD_DIMENSIONS } from "@/design/webglCard/cardDimensions";
import { ArenaZone } from "@/game/arena3d/ArenaZone";
import type { ArenaBreedingSpot } from "@/game/arena3d/breeding/ArenaBreedingSpot";
import { computeArenaBreedingSpotlight } from "@/game/arena3d/breeding/computeArenaBreedingSpotlight";
import { ArenaLayoutVariant } from "@/game/arena3d/field/ArenaLayoutVariant";
import {
  ARENA_MEMORY_TRACK,
  ARENA_PILE_CARD_WIDTH,
  ARENA_ROW_LAYOUT,
  ARENA_SECURITY_LAYOUT,
} from "@/game/arena3d/field/arenaWorldLayout";
import { getArenaColumnX } from "@/game/arena3d/field/getArenaColumnX";
import { Side } from "@/game/side";

type PadBox = {
  left: number;
  right: number;
  far: number;
  near: number;
};

type PadParams = {
  spots: ArenaBreedingSpot[];
  reach: number;
};

type CoverParams = {
  spot: ArenaBreedingSpot;
  cardWidth: number;
};

function coversCard({ spot, cardWidth }: CoverParams): boolean {
  return spot.halfWidth > cardWidth / 2 && spot.halfDepth > (cardWidth * CARD_DIMENSIONS.height) / 2;
}

const HALO_REACH = 0.25;
const SHORT_EDGE_MARGIN = 1;

function measurePad({ spots, reach }: PadParams): PadBox {
  return {
    left: Math.min(...spots.map((spot) => spot.x - spot.halfWidth)) - reach,
    right: Math.max(...spots.map((spot) => spot.x + spot.halfWidth)) + reach,
    far: Math.min(...spots.map((spot) => spot.z - spot.halfDepth)) - reach,
    near: Math.max(...spots.map((spot) => spot.z + spot.halfDepth)) + reach,
  };
}

describe.each(Object.values(ArenaLayoutVariant))("the breeding spotlight on the $name layout", (layout) => {
  const spotlight = computeArenaBreedingSpotlight(layout);

  it("centres one spot on each of the viewer's eggs and raising slots", () => {
    const eggs = layout.zones[`${Side.Viewer}:${ArenaZone.EGGS.value}`]!;
    const raising = layout.zones[`${Side.Viewer}:${ArenaZone.RAISING.value}`]!;
    expect([spotlight.eggs.x, spotlight.eggs.z]).toEqual([eggs.x, eggs.z]);
    expect([spotlight.raising.x, spotlight.raising.z]).toEqual([raising.x, raising.z]);
  });

  it("leaves the whole egg pile and raising card inside the lit area", () => {
    expect(coversCard({ spot: spotlight.eggs, cardWidth: ARENA_PILE_CARD_WIDTH })).toBe(true);
    expect(coversCard({ spot: spotlight.raising, cardWidth: ARENA_ROW_LAYOUT.cardWidth })).toBe(true);
  });

  it("keeps the viewer's security stack outside the lit area", () => {
    const security = layout.zones[`${Side.Viewer}:${ArenaZone.SECURITY.value}`]!;
    const securityHalfWidth = (ARENA_SECURITY_LAYOUT.tileWidth * CARD_DIMENSIONS.height) / 2;
    const securityHalfDepth = ARENA_SECURITY_LAYOUT.maxDepth / 2;
    for (const spot of [spotlight.eggs, spotlight.raising]) {
      const apartX = Math.abs(spot.x - security.x) >= spot.halfWidth + securityHalfWidth;
      const apartZ = Math.abs(spot.z - security.z) >= spot.halfDepth + securityHalfDepth;
      expect(apartX || apartZ).toBe(true);
    }
  });
});

describe("the breeding pad on the short layout", () => {
  const layout = ArenaLayoutVariant.SHORT;
  const spotlight = computeArenaBreedingSpotlight(layout);
  const spots = [spotlight.eggs, spotlight.raising];
  const pad = measurePad({ spots, reach: HALO_REACH });
  const litPad = measurePad({ spots, reach: 0 });

  it("keeps the pad and its halo away from the left edge, so landscape phones show the whole frame", () => {
    expect(pad.left).toBeGreaterThanOrEqual(-layout.bounds.halfWidth + SHORT_EDGE_MARGIN);
    expect(pad.near).toBeLessThanOrEqual(layout.bounds.halfDepth);
  });

  it("keeps the pad and its halo off the field columns, and the lit pad off the memory track", () => {
    const columnEdge = getArenaColumnX(0, layout.lanes) - ARENA_ROW_LAYOUT.cardWidth / 2;
    expect(pad.right).toBeLessThan(columnEdge);
    expect(litPad.far).toBeGreaterThan(ARENA_MEMORY_TRACK.railHalfDepth * layout.memoryScale);
  });

  it("keeps the pad and its halo clear of the viewer's security stack", () => {
    const security = layout.zones[`${Side.Viewer}:${ArenaZone.SECURITY.value}`]!;
    const securityRight = security.x + (ARENA_SECURITY_LAYOUT.tileWidth * CARD_DIMENSIONS.height) / 2;
    expect(pad.left).toBeGreaterThan(securityRight);
  });
});
