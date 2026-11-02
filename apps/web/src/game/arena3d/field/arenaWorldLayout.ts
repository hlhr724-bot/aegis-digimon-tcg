import type { ArenaZone } from "@/game/arena3d/ArenaZone";
import type { Side } from "@/game/side";

export const ARENA_ROW_LAYOUT = {
  cardWidth: 1.2,
  columns: 5,
  gap: 0.24,
  sourceStep: 0.035,
  linkStep: 0.22,
} as const;

export const ARENA_PILE_CARD_WIDTH = 1.12;

export const ARENA_SECURITY_LAYOUT = {
  tileWidth: 0.8,
  tileStep: 0.3,
  maxDepth: 1.9,
} as const;

export const ARENA_MEMORY_TRACK = {
  coinSpacing: 0.54,
  coinRadius: 0.22,
  markerScale: 1.3,
  height: 0.03,
  railHalfDepth: 0.25,
} as const;

export type ArenaZoneKey = `${Side}:${ArenaZone}`;

export type ArenaZonePoint = { x: number; z: number };

export type ArenaZoneSlots = Partial<Record<ArenaZoneKey, ArenaZonePoint>>;

export type ArenaLaneLayout = {
  digimonDepth: number;
  supportDepth: number;
  columnPitch: number;
  halfWidth: number;
};
