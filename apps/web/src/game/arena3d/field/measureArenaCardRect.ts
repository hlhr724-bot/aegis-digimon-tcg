import type { PerspectiveCamera } from "three";
import type { ArenaCameraFrame, ArenaScreenRect } from "@/game/arena3d/field/ArenaCameraFrame";
import { CARD_FLOOR_HEIGHT } from "@/game/arena3d/arenaSceneLayout";
import { projectArenaPoint } from "@/game/arena3d/field/projectArenaPoint";

type Params = {
  frame: ArenaCameraFrame;
  camera: PerspectiveCamera;
  x: number;
  z: number;
  width: number;
  depth: number;
};

export function measureArenaCardRect({ frame, camera, x, z, width, depth }: Params): ArenaScreenRect {
  const left = projectArenaPoint({ frame, camera, x: x - width / 2, z, y: CARD_FLOOR_HEIGHT });
  const right = projectArenaPoint({ frame, camera, x: x + width / 2, z, y: CARD_FLOOR_HEIGHT });
  const top = projectArenaPoint({ frame, camera, x, z: z - depth / 2, y: CARD_FLOOR_HEIGHT });
  const bottom = projectArenaPoint({ frame, camera, x, z: z + depth / 2, y: CARD_FLOOR_HEIGHT });
  const pixelWidth = right.x - left.x;
  const pixelHeight = bottom.y - top.y;
  const centerY = (top.y + bottom.y) / 2;
  return {
    left: (left.x + right.x) / 2 - pixelWidth / 2,
    top: centerY - pixelHeight / 2,
    width: pixelWidth,
    height: pixelHeight,
  };
}
