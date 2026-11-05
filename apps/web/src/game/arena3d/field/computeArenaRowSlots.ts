import type { Permanent } from "@aegis/shared";
import { BattleLanes } from "@/design/battleLanes";
import { CARD_DIMENSIONS } from "@/design/webglCard/cardDimensions";
import { ARENA_ROW_LAYOUT, type ArenaLaneLayout } from "@/game/arena3d/field/arenaWorldLayout";
import type { ArenaRowSlot } from "@/game/arena3d/field/ArenaRowSlot";
import { ARENA_VISIBLE_SOURCE_LIMIT } from "@/game/arena3d/field/arenaCardStackLayout";
import { getArenaColumnX } from "@/game/arena3d/field/getArenaColumnX";
import type { FieldArrangement } from "@/game/screen/model/fieldArrangement";
import { Side } from "@/game/side";

type Params = {
  side: Side;
  lanes: ArenaLaneLayout;
  arrangement: FieldArrangement;
  isSuspended: (permanent: Permanent) => boolean;
};

type LaneCard = {
  fieldKey: string;
  permanent: Permanent;
  members: readonly Permanent[];
  suspended: boolean;
  sourceCount: number;
  linkCount: number;
};

type Footprint = {
  body: number;
  before: number;
  after: number;
};

type LaneParams = {
  cards: readonly LaneCard[];
  side: Side;
  lanes: ArenaLaneLayout;
  depth: number;
};

const MINIMUM_CLEARANCE = 0.06;

function measureFootprint(card: LaneCard, width: number): Footprint {
  const body = card.suspended ? width * CARD_DIMENSIONS.height : width;
  const visibleSources = Math.min(card.sourceCount, ARENA_VISIBLE_SOURCE_LIMIT);
  const before = visibleSources > 0 ? width * (0.05 + visibleSources * ARENA_ROW_LAYOUT.sourceStep) : 0;
  const after = card.linkCount > 0 ? width * (0.35 + card.linkCount * ARENA_ROW_LAYOUT.linkStep) : 0;
  return { body, before, after };
}

function getStartColumn(count: number, side: Side): number {
  const spare = ARENA_ROW_LAYOUT.columns - count;
  return side === Side.Viewer ? Math.floor(spare / 2) : Math.ceil(spare / 2);
}

function fitsColumns(cards: readonly LaneCard[], lanes: ArenaLaneLayout): boolean {
  const width = ARENA_ROW_LAYOUT.cardWidth;
  return cards.every((card, index) => {
    const next = cards[index + 1];
    if (!next) {
      return true;
    }
    const left = measureFootprint(card, width);
    const right = measureFootprint(next, width);
    const reach = left.body / 2 + left.after + right.before + right.body / 2;
    return reach + MINIMUM_CLEARANCE <= lanes.columnPitch;
  });
}

function placeOnColumns({ cards, side, lanes, depth }: LaneParams): ArenaRowSlot[] {
  const start = getStartColumn(cards.length, side);
  const z = side === Side.Viewer ? depth : -depth;
  return cards.map((card, index) => ({
    ...card,
    side,
    x: getArenaColumnX(start + index, lanes),
    z,
    width: ARENA_ROW_LAYOUT.cardWidth,
    column: start + index,
  }));
}

function placePacked({ cards, side, lanes, depth }: LaneParams): ArenaRowSlot[] {
  const naturalTotal =
    cards.reduce((sum, card) => {
      const footprint = measureFootprint(card, ARENA_ROW_LAYOUT.cardWidth);
      return sum + footprint.body + footprint.before + footprint.after;
    }, 0) +
    ARENA_ROW_LAYOUT.gap * (cards.length - 1);
  const scale = Math.min(1, (lanes.halfWidth * 2) / naturalTotal);
  const width = ARENA_ROW_LAYOUT.cardWidth * scale;
  const gap = ARENA_ROW_LAYOUT.gap * scale;
  let cursor = -(naturalTotal * scale) / 2;
  const z = side === Side.Viewer ? depth : -depth;
  return cards.map((card) => {
    const footprint = measureFootprint(card, width);
    const x = cursor + footprint.before + footprint.body / 2;
    cursor += footprint.before + footprint.body + footprint.after + gap;
    return { ...card, side, x, z, width, column: undefined };
  });
}

function placeLane(params: LaneParams): ArenaRowSlot[] {
  if (params.cards.length === 0) {
    return [];
  }
  if (params.cards.length <= ARENA_ROW_LAYOUT.columns && fitsColumns(params.cards, params.lanes)) {
    return placeOnColumns(params);
  }
  return placePacked(params);
}

function buildLaneCard(
  permanent: Permanent,
  members: readonly Permanent[],
  fieldKey: string,
  isSuspended: Params["isSuspended"],
): LaneCard {
  return {
    fieldKey,
    permanent,
    members,
    suspended: isSuspended(permanent),
    sourceCount: permanent.stack?.length ?? 0,
    linkCount: permanent.linked?.length ?? 0,
  };
}

export function computeArenaRowSlots({ side, lanes, arrangement, isSuspended }: Params): ArenaRowSlot[] {
  const digimon = arrangement.digimon.map((permanent) =>
    buildLaneCard(permanent, [permanent], permanent.permanentId, isSuspended),
  );
  const support = arrangement.support.map((group) =>
    buildLaneCard(group.members[0]!, group.members, group.key, isSuspended),
  );
  if (lanes.count === BattleLanes.One) {
    return placeLane({ cards: [...digimon, ...support], side, lanes, depth: lanes.digimonDepth });
  }
  return [
    ...placeLane({ cards: digimon, side, lanes, depth: lanes.digimonDepth }),
    ...placeLane({ cards: support, side, lanes, depth: lanes.supportDepth }),
  ];
}
