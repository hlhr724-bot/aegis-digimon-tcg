import { describe, expect, it } from "vitest";
import { BattleLanes } from "@/design/battleLanes";
import { ArenaLayoutVariant } from "@/game/arena3d/field/ArenaLayoutVariant";
import { measureArenaSlotGrid } from "@/game/arena3d/slots/measureArenaSlotGrid";

describe("measureArenaSlotGrid", () => {
  it("frames the five columns and both rows of one side", () => {
    const grid = measureArenaSlotGrid({
      count: BattleLanes.Two,
      digimonDepth: 1,
      supportDepth: 3,
      columnPitch: 1.5,
      halfWidth: 4,
    });

    expect(grid.halfWidth).toBeCloseTo(3.6);
    expect(grid.centerDepth).toBeCloseTo(2);
    expect(grid.halfDepth).toBeGreaterThan(1);
  });

  it("keeps every layout grid on its own side of the center line", () => {
    for (const layout of Object.values(ArenaLayoutVariant)) {
      const grid = measureArenaSlotGrid(layout.lanes);

      expect(grid.centerDepth - grid.halfDepth).toBeGreaterThan(0);
    }
  });
});
