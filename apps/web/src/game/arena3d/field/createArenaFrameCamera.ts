import { PerspectiveCamera } from "three";
import { CAMERA_FOV_DEGREES } from "@/game/arena3d/arenaSceneLayout";
import type { ArenaCameraFrame } from "@/game/arena3d/field/ArenaCameraFrame";

export function createArenaFrameCamera(frame: ArenaCameraFrame): PerspectiveCamera {
  const camera = new PerspectiveCamera(
    CAMERA_FOV_DEGREES,
    frame.canvasWidth / Math.max(1, frame.canvasHeight),
    0.1,
    200,
  );
  camera.position.set(...frame.position);
  camera.lookAt(...frame.target);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}
