import type { PerspectiveCamera } from "three";
import type { ArenaCameraFrame } from "@/game/arena3d/field/ArenaCameraFrame";

type Params = {
  frame: ArenaCameraFrame;
  camera: PerspectiveCamera;
  x: number;
  z: number;
  y?: number;
};

type ClipPoint = {
  x: number;
  y: number;
  w: number;
};

function transformToClip(camera: PerspectiveCamera, x: number, y: number, z: number): ClipPoint {
  const view = camera.matrixWorldInverse.elements;
  const projection = camera.projectionMatrix.elements;
  const viewX = view[0]! * x + view[4]! * y + view[8]! * z + view[12]!;
  const viewY = view[1]! * x + view[5]! * y + view[9]! * z + view[13]!;
  const viewZ = view[2]! * x + view[6]! * y + view[10]! * z + view[14]!;
  const viewW = view[3]! * x + view[7]! * y + view[11]! * z + view[15]!;
  return {
    x: projection[0]! * viewX + projection[4]! * viewY + projection[8]! * viewZ + projection[12]! * viewW,
    y: projection[1]! * viewX + projection[5]! * viewY + projection[9]! * viewZ + projection[13]! * viewW,
    w: projection[3]! * viewX + projection[7]! * viewY + projection[11]! * viewZ + projection[15]! * viewW,
  };
}

export function projectArenaPoint({ frame, camera, x, z, y = 0 }: Params): { x: number; y: number } {
  const clip = transformToClip(camera, x, y, z);
  const ndcX = clip.x / clip.w;
  const ndcY = clip.y / clip.w;
  return {
    x: ((ndcX + 1) / 2) * frame.canvasWidth - frame.fieldLeft,
    y: ((1 - ndcY) / 2) * frame.canvasHeight - frame.fieldTop,
  };
}
