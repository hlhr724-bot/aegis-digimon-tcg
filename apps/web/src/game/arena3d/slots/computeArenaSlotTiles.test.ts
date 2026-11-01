import type { Permanent } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import type { ArenaRowSlot } from "@/game/arena3d/field/ArenaRowSlot";
import { ARENA_ROW_LAYOUT } from "@/game/arena3d/field/arenaWorldLayout";
import { ArenaLayoutVariant } from "@/game/arena3d/field/ArenaLayoutVariant";
import { computeArenaRowSlots } from "@/game/arena3d/field/computeArenaRowSlots";
import type { ArenaSlotTile } from "@/game/arena3d/slots/ArenaSlotTile";
import { ArenaSlotTileKind } from "@/game/arena3d/slots/ArenaSlotTileKind";
import { computeArenaSlotTiles } from "@/game/arena3d/slots/computeArenaSlotTiles";
import { Side } from "@/game/side";

function buildPermanent(permanentId: string): Permanent {
  return {
    permanentId,
    topCard: { instanceId: `${permanentId}-top`, cardId: "BT1-010", faceUp: true },
    stack: [],
    linked: [],
    isSuspended: false,
  } as unknown as Permanent;
}

const LANES = ArenaLayoutVariant.WIDE.lanes;

function buildRow(side: Side, digimonCount: number, supportCount = 0): ArenaRowSlot[] {
  return computeArenaRowSlots({
    side,
    lanes: LANES,
    arrangement: {
      digimon: Array.from({ length: digimonCount }, (_, index) => buildPermanent(`${side}-d${index}`)),
      support: Array.from({ length: supportCount }, (_, index) => {
        const permanent = buildPermanent(`${side}-s${index}`);
        return { key: permanent.permanentId, members: [permanent] };
      }),
    },
    isSuspended: () => false,
  });
}

function selectLane(tiles: readonly ArenaSlotTile[], side: Side, depth: number): ArenaSlotTile[] {
  const z = side === Side.Viewer ? depth : -depth;
  return tiles.filter((tile) => tile.side === side && tile.z === z);
}

function countKind(tiles: readonly ArenaSlotTile[], kind: ArenaSlotTileKind): number {
  return tiles.filter((tile) => tile.kind === kind).length;
}

describe("computeArenaSlotTiles", () => {
  it("shows five equal empty slots in every lane of an empty field", () => {
    const tiles = computeArenaSlotTiles({ rows: { [Side.Viewer]: [], [Side.Opponent]: [] }, lanes: LANES });
    for (const side of [Side.Viewer, Side.Opponent]) {
      for (const depth of [LANES.digimonDepth, LANES.supportDepth]) {
        const lane = selectLane(tiles, side, depth);
        expect(lane).toHaveLength(ARENA_ROW_LAYOUT.columns);
        expect(countKind(lane, ArenaSlotTileKind.EMPTY.value)).toBe(ARENA_ROW_LAYOUT.columns);
      }
    }
    expect(new Set(tiles.map((tile) => tile.width)).size).toBe(1);
  });

  it("aligns the support slots with the digimon slots", () => {
    const tiles = computeArenaSlotTiles({
      rows: { [Side.Viewer]: buildRow(Side.Viewer, 2, 1), [Side.Opponent]: [] },
      lanes: LANES,
    });
    const digimon = selectLane(tiles, Side.Viewer, LANES.digimonDepth);
    const support = selectLane(tiles, Side.Viewer, LANES.supportDepth);
    expect(support.map((tile) => tile.x)).toEqual(digimon.map((tile) => tile.x));
    expect(countKind(digimon, ArenaSlotTileKind.OCCUPIED.value)).toBe(2);
    expect(countKind(support, ArenaSlotTileKind.OCCUPIED.value)).toBe(1);
  });

  it("lights the slot under each card", () => {
    const row = buildRow(Side.Opponent, 3);
    const lane = selectLane(
      computeArenaSlotTiles({ rows: { [Side.Viewer]: [], [Side.Opponent]: row }, lanes: LANES }),
      Side.Opponent,
      LANES.digimonDepth,
    );
    const occupied = lane.filter((tile) => tile.kind === ArenaSlotTileKind.OCCUPIED.value).map((tile) => tile.x);
    expect(occupied).toEqual(row.map((slot) => slot.x));
  });

  it("keeps one equal slot per card when a lane overflows", () => {
    const row = buildRow(Side.Viewer, 8);
    const lane = selectLane(
      computeArenaSlotTiles({ rows: { [Side.Viewer]: row, [Side.Opponent]: [] }, lanes: LANES }),
      Side.Viewer,
      LANES.digimonDepth,
    );
    expect(lane).toHaveLength(8);
    expect(countKind(lane, ArenaSlotTileKind.EMPTY.value)).toBe(0);
    expect(new Set(lane.map((tile) => tile.width)).size).toBe(1);
  });
});
