import { ArenaZone } from "@/game/arena3d/ArenaZone";
import type { ArenaLaneLayout, ArenaZoneSlots } from "@/game/arena3d/field/arenaWorldLayout";
import { Side } from "@/game/side";

type ArenaLayoutVariantShape = {
  name: string;
  value: string;
  bounds: { halfWidth: number; halfDepth: number };
  lanes: ArenaLaneLayout;
  zones: ArenaZoneSlots;
  memoryScale: number;
  pitchDegrees: number;
  aura: ArenaAuraTuning;
};

type ArenaAuraTuning = {
  strength: number;
  centerFade: number;
  boundsFade: number;
  screenFadeX: number;
  wash: boolean;
};

const ROOMY_AURA: ArenaAuraTuning = {
  strength: 1,
  centerFade: 2,
  boundsFade: 1.4,
  screenFadeX: 0.12,
  wash: false,
};

const WIDE_ZONES: ArenaZoneSlots = {
  [`${Side.Opponent}:${ArenaZone.DECK.value}`]: { x: -7.75, z: -1.9 },
  [`${Side.Opponent}:${ArenaZone.TRASH.value}`]: { x: -7.75, z: -3.75 },
  [`${Side.Viewer}:${ArenaZone.SECURITY.value}`]: { x: -7.75, z: 1.9 },
  [`${Side.Opponent}:${ArenaZone.EGGS.value}`]: { x: 7.75, z: -4 },
  [`${Side.Opponent}:${ArenaZone.RAISING.value}`]: { x: 6.4, z: -4 },
  [`${Side.Opponent}:${ArenaZone.SECURITY.value}`]: { x: 7.75, z: -1.9 },
  [`${Side.Viewer}:${ArenaZone.DECK.value}`]: { x: 7.75, z: 1.9 },
  [`${Side.Viewer}:${ArenaZone.TRASH.value}`]: { x: 7.75, z: 3.75 },
  [`${Side.Viewer}:${ArenaZone.EGGS.value}`]: { x: -7.75, z: 4 },
  [`${Side.Viewer}:${ArenaZone.RAISING.value}`]: { x: -6.4, z: 4 },
};

const SHORT_ZONES: ArenaZoneSlots = {
  [`${Side.Opponent}:${ArenaZone.DECK.value}`]: { x: -7.75, z: -1.7 },
  [`${Side.Opponent}:${ArenaZone.TRASH.value}`]: { x: -7.75, z: -3.4 },
  [`${Side.Viewer}:${ArenaZone.SECURITY.value}`]: { x: -7.75, z: 1.7 },
  [`${Side.Opponent}:${ArenaZone.EGGS.value}`]: { x: 5.3, z: -1.38 },
  [`${Side.Opponent}:${ArenaZone.RAISING.value}`]: { x: 5.3, z: -3.2 },
  [`${Side.Opponent}:${ArenaZone.SECURITY.value}`]: { x: 7.75, z: -1.7 },
  [`${Side.Viewer}:${ArenaZone.DECK.value}`]: { x: 7.75, z: 1.7 },
  [`${Side.Viewer}:${ArenaZone.TRASH.value}`]: { x: 7.75, z: 3.4 },
  [`${Side.Viewer}:${ArenaZone.EGGS.value}`]: { x: -5.3, z: 1.38 },
  [`${Side.Viewer}:${ArenaZone.RAISING.value}`]: { x: -5.3, z: 3.2 },
};

const TALL_PILE_DEPTH = 4.95;
const TALL_PILE_NEAR_X = 1.85;
const TALL_PILE_FAR_X = 3.3;

const TALL_ZONES: ArenaZoneSlots = {
  [`${Side.Opponent}:${ArenaZone.TRASH.value}`]: { x: -TALL_PILE_FAR_X, z: -TALL_PILE_DEPTH },
  [`${Side.Opponent}:${ArenaZone.DECK.value}`]: { x: -TALL_PILE_NEAR_X, z: -TALL_PILE_DEPTH },
  [`${Side.Opponent}:${ArenaZone.SECURITY.value}`]: { x: 0, z: -TALL_PILE_DEPTH },
  [`${Side.Opponent}:${ArenaZone.RAISING.value}`]: { x: TALL_PILE_NEAR_X, z: -TALL_PILE_DEPTH },
  [`${Side.Opponent}:${ArenaZone.EGGS.value}`]: { x: TALL_PILE_FAR_X, z: -TALL_PILE_DEPTH },
  [`${Side.Viewer}:${ArenaZone.EGGS.value}`]: { x: -TALL_PILE_FAR_X, z: TALL_PILE_DEPTH },
  [`${Side.Viewer}:${ArenaZone.RAISING.value}`]: { x: -TALL_PILE_NEAR_X, z: TALL_PILE_DEPTH },
  [`${Side.Viewer}:${ArenaZone.SECURITY.value}`]: { x: 0, z: TALL_PILE_DEPTH },
  [`${Side.Viewer}:${ArenaZone.DECK.value}`]: { x: TALL_PILE_NEAR_X, z: TALL_PILE_DEPTH },
  [`${Side.Viewer}:${ArenaZone.TRASH.value}`]: { x: TALL_PILE_FAR_X, z: TALL_PILE_DEPTH },
};

export const ArenaLayoutVariant = {
  WIDE: {
    name: "WIDE",
    value: "wide",
    bounds: { halfWidth: 8.4, halfDepth: 4.85 },
    lanes: { digimonDepth: 1.62, supportDepth: 3.62, columnPitch: 1.74, halfWidth: 6.1 },
    zones: WIDE_ZONES,
    memoryScale: 1,
    pitchDegrees: 62,
    aura: ROOMY_AURA,
  },
  SHORT: {
    name: "SHORT",
    value: "short",
    bounds: { halfWidth: 9.95, halfDepth: 4.4 },
    lanes: { digimonDepth: 1.32, supportDepth: 3.26, columnPitch: 1.74, halfWidth: 6.1 },
    zones: SHORT_ZONES,
    memoryScale: 1,
    pitchDegrees: 62,
    aura: ROOMY_AURA,
  },
  TALL: {
    name: "TALL",
    value: "tall",
    bounds: { halfWidth: 3.95, halfDepth: 6.25 },
    lanes: { digimonDepth: 1.22, supportDepth: 3.06, columnPitch: 1.5, halfWidth: 3.6 },
    zones: TALL_ZONES,
    memoryScale: 0.5,
    pitchDegrees: 66,
    aura: { strength: 1, centerFade: 0.9, boundsFade: 0.6, screenFadeX: 0.04, wash: true },
  },
} as const satisfies Record<string, ArenaLayoutVariantShape>;

export type ArenaLayoutVariant = (typeof ArenaLayoutVariant)[keyof typeof ArenaLayoutVariant]["value"];

export type ArenaLayoutVariantEntry = (typeof ArenaLayoutVariant)[keyof typeof ArenaLayoutVariant];
