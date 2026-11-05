import { PerspectiveCamera, Vector3 } from "three";
import { CAMERA_FOV_DEGREES } from "@/game/arena3d/arenaSceneLayout";
import type { ArenaCameraFrame, ArenaScreenRect } from "@/game/arena3d/field/ArenaCameraFrame";
import type { ArenaLayoutVariantEntry } from "@/game/arena3d/field/ArenaLayoutVariant";
import type { ArenaLaneLayout } from "@/game/arena3d/field/arenaWorldLayout";
import { createArenaFloorProjector } from "@/game/arena3d/field/createArenaFloorProjector";

type Params = {
  canvasWidth: number;
  canvasHeight: number;
  field: ArenaScreenRect;
  origin: { left: number; top: number };
  layout: ArenaLayoutVariantEntry;
  lanes: ArenaLaneLayout;
};

type Corner = readonly [number, number];

const MIN_DISTANCE = 6;
const MAX_DISTANCE = 80;
const SEARCH_STEPS = 22;

function listCorners({ bounds }: ArenaLayoutVariantEntry): Corner[] {
  return [
    [-bounds.halfWidth, -bounds.halfDepth],
    [bounds.halfWidth, -bounds.halfDepth],
    [-bounds.halfWidth, bounds.halfDepth],
    [bounds.halfWidth, bounds.halfDepth],
  ];
}

function placeCamera(camera: PerspectiveCamera, distance: number, target: Vector3, pitchDegrees: number) {
  const pitch = (pitchDegrees * Math.PI) / 180;
  camera.position.set(target.x, Math.sin(pitch) * distance, target.z + Math.cos(pitch) * distance);
  camera.lookAt(target);
  camera.updateMatrixWorld();
}

function centerOnField(camera: PerspectiveCamera, distance: number, params: Params): Vector3 {
  const { field } = params;
  const canvas = { left: 0, top: 0, width: params.canvasWidth, height: params.canvasHeight } as DOMRect;
  const projector = createArenaFloorProjector();
  const target = new Vector3();
  const hit = new Vector3();
  for (let pass = 0; pass < 4; pass += 1) {
    placeCamera(camera, distance, target, params.layout.pitchDegrees);
    projector.begin(camera, canvas);
    if (!projector.project(field.left + field.width / 2, field.top + field.height / 2, hit)) {
      break;
    }
    target.sub(hit);
  }
  placeCamera(camera, distance, target, params.layout.pitchDegrees);
  return target;
}

function fitsField(camera: PerspectiveCamera, params: Params): boolean {
  const { field, canvasWidth, canvasHeight } = params;
  const point = new Vector3();
  return listCorners(params.layout).every(([x, z]) => {
    point.set(x, 0, z).project(camera);
    const screenX = ((point.x + 1) / 2) * canvasWidth;
    const screenY = ((1 - point.y) / 2) * canvasHeight;
    return (
      point.z < 1 &&
      screenX >= field.left - 1 &&
      screenX <= field.left + field.width + 1 &&
      screenY >= field.top - 1 &&
      screenY <= field.top + field.height + 1
    );
  });
}

export function computeArenaCameraFrame(params: Params): ArenaCameraFrame {
  const camera = new PerspectiveCamera(
    CAMERA_FOV_DEGREES,
    params.canvasWidth / Math.max(1, params.canvasHeight),
    0.1,
    200,
  );
  let low = MIN_DISTANCE;
  let high = MAX_DISTANCE;
  for (let step = 0; step < SEARCH_STEPS; step += 1) {
    const middle = (low + high) / 2;
    centerOnField(camera, middle, params);
    if (fitsField(camera, params)) {
      high = middle;
    } else {
      low = middle;
    }
  }
  const target = centerOnField(camera, high, params);
  return {
    position: [camera.position.x, camera.position.y, camera.position.z],
    target: [target.x, target.y, target.z],
    canvasWidth: params.canvasWidth,
    canvasHeight: params.canvasHeight,
    fieldLeft: params.origin.left,
    fieldTop: params.origin.top,
    layout: params.layout,
    lanes: params.lanes,
  };
}
