import type { ArenaLayoutVariantEntry } from "@/game/arena3d/field/ArenaLayoutVariant";
import type { ArenaLaneLayout } from "@/game/arena3d/field/arenaWorldLayout";

export type ArenaScreenRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ArenaCameraFrame = {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  canvasWidth: number;
  canvasHeight: number;
  fieldLeft: number;
  fieldTop: number;
  layout: ArenaLayoutVariantEntry;
  lanes: ArenaLaneLayout;
};
