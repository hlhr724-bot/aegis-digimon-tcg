import type { Object3D } from "three";
import type { ArenaCardPose } from "@/game/arena3d/field/ArenaTrackedField";
import type { ArenaCardMotionSample } from "@/game/arena3d/effects/createArenaCardMotionRegistry";

type Params = {
  mesh: Object3D;
  pose: ArenaCardPose;
  motion: ArenaCardMotionSample;
  height: number;
  extraYaw?: number;
};

export function placeArenaCardMesh({ mesh, pose, motion, height, extraYaw = 0 }: Params): void {
  mesh.visible = true;
  mesh.position.set(pose.x + motion.offsetX, height + motion.lift, pose.z + motion.offsetZ);
  mesh.rotation.set(-motion.tilt, pose.yaw + motion.spin + extraYaw, motion.roll, "YXZ");
  mesh.scale.setScalar(pose.width * motion.scale);
}
