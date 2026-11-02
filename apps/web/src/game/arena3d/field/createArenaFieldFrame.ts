import type { PerspectiveCamera } from "three";
import type { ArenaCameraFrame, ArenaScreenRect } from "@/game/arena3d/field/ArenaCameraFrame";
import type { ArenaLayoutVariantEntry } from "@/game/arena3d/field/ArenaLayoutVariant";
import { computeArenaCameraFrame } from "@/game/arena3d/field/computeArenaCameraFrame";
import { createArenaFrameCamera } from "@/game/arena3d/field/createArenaFrameCamera";

type Params = {
  canvasWidth: number;
  canvasHeight: number;
  field: ArenaScreenRect;
  origin: { left: number; top: number };
  layout: ArenaLayoutVariantEntry;
};

export type ArenaFieldFrame = {
  frame: ArenaCameraFrame;
  camera: PerspectiveCamera;
};

export function createArenaFieldFrame(params: Params): ArenaFieldFrame {
  const frame = computeArenaCameraFrame(params);
  return { frame, camera: createArenaFrameCamera(frame) };
}
