import { Plane, Raycaster, Vector2, Vector3, type Camera } from "three";

export type ArenaFloorProjector = {
  begin: (camera: Camera, canvas: DOMRect) => void;
  project: (screenX: number, screenY: number, target: Vector3) => boolean;
};

const FLOOR_PLANE = new Plane(new Vector3(0, 1, 0), 0);

export function createArenaFloorProjector(): ArenaFloorProjector {
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  let activeCamera: Camera | undefined;
  let bounds: DOMRect | undefined;
  return {
    begin(camera, canvas) {
      activeCamera = camera;
      bounds = canvas;
    },
    project(screenX, screenY, target) {
      if (!activeCamera || !bounds || bounds.width === 0 || bounds.height === 0) {
        return false;
      }
      pointer.set(((screenX - bounds.left) / bounds.width) * 2 - 1, -((screenY - bounds.top) / bounds.height) * 2 + 1);
      raycaster.setFromCamera(pointer, activeCamera);
      return raycaster.ray.intersectPlane(FLOOR_PLANE, target) !== null;
    },
  };
}
