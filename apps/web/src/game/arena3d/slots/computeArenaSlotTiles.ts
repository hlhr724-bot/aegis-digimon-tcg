import { CARD_DIMENSIONS } from "@/design/webglCard/cardDimensions";
import { ARENA_VISIBLE_SOURCE_LIMIT } from "@/game/arena3d/field/arenaCardStackLayout";
import type { ArenaRowSlot } from "@/game/arena3d/field/ArenaRowSlot";
import { ARENA_ROW_LAYOUT, type ArenaLaneLayout } from "@/game/arena3d/field/arenaWorldLayout";
import { getArenaColumnX } from "@/game/arena3d/field/getArenaColumnX";
import type { ArenaSlotTile } from "@/game/arena3d/slots/ArenaSlotTile";
import { ArenaSlotTileKind } from "@/game/arena3d/slots/ArenaSlotTileKind";
import { ARENA_SLOT_TILE_LAYOUT } from "@/game/arena3d/slots/arenaSlotTileLayout";
import { Side } from "@/game/side";

type Params = {
  rows: Readonly<Record<Side, readonly ArenaRowSlot[]>>;
  lanes: ArenaLaneLayout;
};

type LaneParams = {
  lanes: ArenaLaneLayout;
  depth: number;
  side: Side;
  slots: readonly ArenaRowSlot[];
};

type TileParams = {
  side: Side;
  kind: ArenaSlotTileKind;
  x: number;
  z: number;
  cardWidth: number;
};

type Reach = {
  left: number;
  right: number;
};

const LANE_TOLERANCE = 0.001;

function buildTile({ side, kind, x, z, cardWidth }: TileParams): ArenaSlotTile {
  const margin = cardWidth * ARENA_SLOT_TILE_LAYOUT.marginRatio * 2;
  return { side, kind, x, z, width: cardWidth + margin, depth: cardWidth * CARD_DIMENSIONS.height + margin };
}

function measureReach(slot: ArenaRowSlot): Reach {
  const body = slot.suspended ? slot.width * CARD_DIMENSIONS.height : slot.width;
  const sources = Math.min(slot.sourceCount, ARENA_VISIBLE_SOURCE_LIMIT);
  const before = sources > 0 ? slot.width * (0.05 + sources * ARENA_ROW_LAYOUT.sourceStep) : 0;
  const after = slot.linkCount > 0 ? slot.width * (0.35 + slot.linkCount * ARENA_ROW_LAYOUT.linkStep) : 0;
  return { left: slot.x - body / 2 - before, right: slot.x + body / 2 + after };
}

function placeColumnTiles({ lanes, depth, side, slots }: LaneParams): ArenaSlotTile[] {
  const z = side === Side.Viewer ? depth : -depth;
  const taken = new Set(slots.map((slot) => slot.column));
  return Array.from({ length: ARENA_ROW_LAYOUT.columns }, (_, column) =>
    buildTile({
      side,
      kind: taken.has(column) ? ArenaSlotTileKind.OCCUPIED.value : ArenaSlotTileKind.EMPTY.value,
      x: getArenaColumnX(column, lanes),
      z,
      cardWidth: ARENA_ROW_LAYOUT.cardWidth,
    }),
  );
}

function placePackedTiles({ lanes, depth, side, slots }: LaneParams): ArenaSlotTile[] {
  const z = side === Side.Viewer ? depth : -depth;
  const cardWidth = slots[0]!.width;
  const gap = ARENA_ROW_LAYOUT.gap * (cardWidth / ARENA_ROW_LAYOUT.cardWidth);
  const occupied = slots.map((slot) =>
    buildTile({ side, kind: ArenaSlotTileKind.OCCUPIED.value, x: slot.x, z, cardWidth }),
  );
  const emptyCount = Math.max(0, ARENA_ROW_LAYOUT.columns - slots.length);
  const reaches = slots.map(measureReach);
  const left = Math.min(...reaches.map((reach) => reach.left));
  const right = Math.max(...reaches.map((reach) => reach.right));
  const rightCount = side === Side.Viewer ? Math.ceil(emptyCount / 2) : Math.floor(emptyCount / 2);
  const pitch = cardWidth + gap;
  const xs = [
    ...Array.from({ length: emptyCount - rightCount }, (_, index) => left - gap - cardWidth / 2 - index * pitch),
    ...Array.from({ length: rightCount }, (_, index) => right + gap + cardWidth / 2 + index * pitch),
  ];
  const empties = xs
    .filter((x) => Math.abs(x) + cardWidth / 2 <= lanes.halfWidth + ARENA_SLOT_TILE_LAYOUT.edgeAllowance)
    .map((x) => buildTile({ side, kind: ArenaSlotTileKind.EMPTY.value, x, z, cardWidth }));
  return [...occupied, ...empties];
}

function placeLaneTiles(params: LaneParams): ArenaSlotTile[] {
  if (params.slots.every((slot) => slot.column !== undefined)) {
    return placeColumnTiles(params);
  }
  return placePackedTiles(params);
}

export function computeArenaSlotTiles({ rows, lanes }: Params): ArenaSlotTile[] {
  return [Side.Viewer, Side.Opponent].flatMap((side) =>
    [lanes.digimonDepth, lanes.supportDepth].flatMap((depth) =>
      placeLaneTiles({
        lanes,
        depth,
        side,
        slots: rows[side].filter((slot) => Math.abs(Math.abs(slot.z) - depth) < LANE_TOLERANCE),
      }),
    ),
  );
}
