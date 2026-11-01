import { useMemo, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import type { ArenaCameraImpulse } from "@/game/arena3d/ArenaCameraImpulse";
import type { ArenaCameraBase } from "@/game/arena3d/field/ArenaCameraBase";
import type { ArenaFieldStore } from "@/game/arena3d/field/createArenaFieldStore";

type Props = {
  base: ArenaCameraBase;
  impulse: RefObject<ArenaCameraImpulse>;
  store: ArenaFieldStore;
  reducedMotion: boolean;
};

const SHAKE_SECONDS = 0.6;

export function Arena3dCameraRig({ base, impulse, store, reducedMotion }: Props) {
  const camera = useThree((state) => state.camera);
  const offset = useMemo(() => new Vector3(), []);
  const aim = useMemo(() => new Vector3(), []);
  const projected = useMemo(() => new Vector3(), []);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const age = time - impulse.current.startedAt;
    offset.set(0, 0, 0);
    if (!reducedMotion && age >= 0 && age < SHAKE_SECONDS) {
      const strength = impulse.current.strength * (1 - age / SHAKE_SECONDS) ** 2;
      offset.set(Math.sin(time * 91) * strength, Math.sin(time * 73 + 1.3) * strength * 0.8, 0);
    } else if (age >= SHAKE_SECONDS) {
      impulse.current.strength = 0;
    }
    camera.position.copy(base.position).add(offset);
    camera.lookAt(aim.copy(base.target).add(offset));
    camera.updateMatrixWorld();
    projected.copy(base.target).project(camera);
    store.shiftOverlay((projected.x * state.size.width) / 2, (-projected.y * state.size.height) / 2);
  });

  return null;
}
