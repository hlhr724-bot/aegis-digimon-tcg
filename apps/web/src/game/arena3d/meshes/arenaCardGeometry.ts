import { PlaneGeometry } from "three";
import { CARD_DIMENSIONS } from "@/design/webglCard/cardDimensions";

export const ARENA_CARD_GLOW_MARGIN = 0.45;
export const ARENA_CARD_SHADOW_MARGIN = 0.28;

function buildFlatPlane(width: number, height: number): PlaneGeometry {
  const geometry = new PlaneGeometry(width, height);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export const ARENA_CARD_GEOMETRY = buildFlatPlane(CARD_DIMENSIONS.width, CARD_DIMENSIONS.height);
export const ARENA_CARD_GLOW_GEOMETRY = buildFlatPlane(
  CARD_DIMENSIONS.width + ARENA_CARD_GLOW_MARGIN * 2,
  CARD_DIMENSIONS.height + ARENA_CARD_GLOW_MARGIN * 2,
);
export const ARENA_CARD_SHADOW_GEOMETRY = buildFlatPlane(
  CARD_DIMENSIONS.width + ARENA_CARD_SHADOW_MARGIN * 2,
  CARD_DIMENSIONS.height + ARENA_CARD_SHADOW_MARGIN * 2,
);
