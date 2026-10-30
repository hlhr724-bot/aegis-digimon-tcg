import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import type { ArenaCameraImpulse } from "@/game/arena3d/ArenaCameraImpulse";
import { CAMERA_POSITION, CAMERA_TARGET } from "@/game/arena3d/arenaSceneLayout";

type Props = {
  impulse: RefObject<ArenaCameraImpulse>;
  activeSide: number;
  reducedMotion: boolean;
};

const SHAKE_SECONDS = 0.6;

export function ArenaCameraRig({ impulse, activeSide, reducedMotion }: Props) {
  const camera = useThree((state) => state.camera);
  const pointer = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  const desired = useMemo(() => new Vector3(), []);
  const target = useMemo(() => new Vector3(...CAMERA_TARGET), []);
  const lean = useRef(0);

  useEffect(() => {
    camera.position.set(...CAMERA_POSITION);
    camera.lookAt(target);
  }, [camera, target]);

  useEffect(() => {
    if (reducedMotion) {
      return;
    }
    const track = (event: PointerEvent) => {
      pointer.current.targetX = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.current.targetY = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", track, { passive: true });
    return () => window.removeEventListener("pointermove", track);
  }, [reducedMotion]);

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 20);
    const time = state.clock.elapsedTime;
    const motion = reducedMotion ? 0 : 1;
    const ease = Math.min(1, delta * 2);
    pointer.current.x += (pointer.current.targetX - pointer.current.x) * ease;
    pointer.current.y += (pointer.current.targetY - pointer.current.y) * ease;
    lean.current += (activeSide - lean.current) * Math.min(1, delta * 1.2);
    desired.set(
      CAMERA_POSITION[0] + (Math.sin(time * 0.13) * 0.6 + pointer.current.x * 0.8) * motion,
      CAMERA_POSITION[1] + (Math.sin(time * 0.21) * 0.2 - pointer.current.y * 0.35) * motion,
      CAMERA_POSITION[2] + lean.current * 0.6 * motion,
    );
    camera.position.lerp(desired, Math.min(1, delta * 3));
    const shakeAge = time - impulse.current.startedAt;
    if (motion && shakeAge >= 0 && shakeAge < SHAKE_SECONDS) {
      const strength = impulse.current.strength * (1 - shakeAge / SHAKE_SECONDS) ** 2;
      camera.position.x += Math.sin(time * 91) * strength;
      camera.position.y += Math.sin(time * 73 + 1.3) * strength * 0.8;
    } else if (shakeAge >= SHAKE_SECONDS) {
      impulse.current.strength = 0;
    }
    camera.lookAt(target);
  });

  return null;
}
