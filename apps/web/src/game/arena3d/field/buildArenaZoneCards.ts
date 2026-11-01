import type { CardInstance } from "@aegis/shared";
import { ArenaZone } from "@/game/arena3d/ArenaZone";
import type { ArenaZoneCard } from "@/game/arena3d/field/ArenaFieldCard";
import { buildArenaCardUrls } from "@/game/arena3d/field/buildArenaCardUrls";
import { Side } from "@/game/side";

export type ArenaSideZones = {
  deckCount: number;
  trash: readonly CardInstance[];
  eggCount: number;
  securityCount: number;
};

type Params = {
  viewer: ArenaSideZones;
  opponent: ArenaSideZones;
  backUrl: string;
  eggBackUrl: string;
};

const SLEEVE_TINT = "#ffffff";
const TRASH_LAYER_TINT = "#8a8f9e";
const SECURITY_TINT = "#9cc2ff";

function buildSideZones(
  side: Side,
  zones: ArenaSideZones,
  backUrl: string,
  eggBackUrl: string,
): [string, ArenaZoneCard][] {
  const back = [backUrl];
  const trashTop = zones.trash[zones.trash.length - 1];
  return [
    [
      `${side}:${ArenaZone.DECK.value}`,
      { count: zones.deckCount, topUrls: back, layerUrls: back, topTint: SLEEVE_TINT, layerTint: SLEEVE_TINT },
    ],
    [
      `${side}:${ArenaZone.TRASH.value}`,
      {
        count: zones.trash.length,
        topUrls: buildArenaCardUrls({ cardId: trashTop?.cardId, artId: trashTop?.artId, faceUp: true, backUrl }),
        layerUrls: back,
        topTint: SLEEVE_TINT,
        layerTint: TRASH_LAYER_TINT,
      },
    ],
    [
      `${side}:${ArenaZone.EGGS.value}`,
      {
        count: zones.eggCount,
        topUrls: [eggBackUrl],
        layerUrls: [eggBackUrl],
        topTint: SLEEVE_TINT,
        layerTint: SLEEVE_TINT,
      },
    ],
    [
      `${side}:${ArenaZone.SECURITY.value}`,
      { count: zones.securityCount, topUrls: back, layerUrls: back, topTint: SECURITY_TINT, layerTint: SECURITY_TINT },
    ],
  ];
}

export function buildArenaZoneCards({
  viewer,
  opponent,
  backUrl,
  eggBackUrl,
}: Params): ReadonlyMap<string, ArenaZoneCard> {
  return new Map([
    ...buildSideZones(Side.Viewer, viewer, backUrl, eggBackUrl),
    ...buildSideZones(Side.Opponent, opponent, backUrl, eggBackUrl),
  ]);
}
