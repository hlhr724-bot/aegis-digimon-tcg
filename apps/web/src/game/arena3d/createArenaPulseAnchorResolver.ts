import { Vector3, type Camera } from "three";
import type { ArenaPulseAnchor } from "@/game/arena3d/ArenaPulseAnchor";
import type { ArenaTrackedField } from "@/game/arena3d/field/ArenaTrackedField";
import { createArenaFloorProjector } from "@/game/arena3d/field/createArenaFloorProjector";

type Params = {
  field: ArenaTrackedField;
  camera: Camera;
  canvas: HTMLCanvasElement;
  size: { width: number; height: number };
};

export type ArenaPulseAnchorResolver = (anchor: ArenaPulseAnchor | undefined) => Vector3 | undefined;

export function createArenaPulseAnchorResolver({ field, camera, canvas, size }: Params): ArenaPulseAnchorResolver {
  const boardProjector = createArenaFloorProjector();
  boardProjector.begin(camera, new DOMRect(0, 0, size.width, size.height));
  let screenProjector: ReturnType<typeof createArenaFloorProjector> | undefined;

  return (anchor) => {
    if (!anchor) {
      return undefined;
    }
    const permanent = anchor.permanentId ? field.permanents.get(anchor.permanentId) : undefined;
    if (permanent) {
      return new Vector3(permanent.top.x, 0, permanent.top.z);
    }
    const zone = anchor.zoneKey ? field.zones.get(anchor.zoneKey) : undefined;
    if (zone) {
      return new Vector3(zone.pose.x, 0, zone.pose.z);
    }
    const position = new Vector3();
    if (anchor.boardPoint) {
      return boardProjector.project(anchor.boardPoint.x, anchor.boardPoint.y, position) ? position : undefined;
    }
    const point = anchor.locate?.();
    if (!point) {
      return undefined;
    }
    if (!screenProjector) {
      screenProjector = createArenaFloorProjector();
      screenProjector.begin(camera, canvas.getBoundingClientRect());
    }
    return screenProjector.project(point.x, point.y, position) ? position : undefined;
  };
}
