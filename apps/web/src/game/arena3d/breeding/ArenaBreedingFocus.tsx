import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PlaneGeometry, type Mesh, type Vector4 } from "three";
import type { ArenaActivity } from "@/game/arena3d/ArenaActivity";
import type { ArenaBreedingSpot } from "@/game/arena3d/breeding/ArenaBreedingSpot";
import { buildArenaBreedingFocusMaterial } from "@/game/arena3d/breeding/buildArenaBreedingFocusMaterial";
import { computeArenaBreedingSpotlight } from "@/game/arena3d/breeding/computeArenaBreedingSpotlight";
import { readArenaRaisingSocket } from "@/game/arena3d/breeding/readArenaRaisingSocket";
import { stepArenaBreedingFocus } from "@/game/arena3d/breeding/stepArenaBreedingFocus";
import type { ArenaLayoutVariantEntry } from "@/game/arena3d/field/ArenaLayoutVariant";

type Props = {
  active: boolean;
  breedingPermanents: ReadonlyMap<string, string>;
  rimColor: string;
  layout: ArenaLayoutVariantEntry;
  linearBlending: boolean;
  activity: RefObject<ArenaActivity>;
  reducedMotion: boolean;
};

const PLANE_SIZE = 160;
const FOCUS_HEIGHT = 0.05;
const FOCUS_RENDER_ORDER = 20;
const DIM_STRENGTH = 0.55;
const SRGB_GAMMA = 2.2;
const LINEAR_DIM_STRENGTH = 1 - Math.pow(1 - DIM_STRENGTH, SRGB_GAMMA);
const BUSY_HOLD_MS = 50;
const PACE_HOLD_MS = 200;

function writeSpot(target: Vector4, spot: ArenaBreedingSpot) {
  target.set(spot.x, spot.z, spot.halfWidth, spot.halfDepth);
}

export function ArenaBreedingFocus({
  active,
  breedingPermanents,
  rimColor,
  layout,
  linearBlending,
  activity,
  reducedMotion,
}: Props) {
  const mesh = useRef<Mesh>(null);
  const level = useRef(0);
  const invalidate = useThree((state) => state.invalidate);
  const geometry = useMemo(() => new PlaneGeometry(PLANE_SIZE, PLANE_SIZE).rotateX(-Math.PI / 2), []);
  const material = useMemo(buildArenaBreedingFocusMaterial, []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useEffect(() => {
    const spotlight = computeArenaBreedingSpotlight(layout);
    writeSpot(material.uniforms.uEggs!.value, spotlight.eggs);
    writeSpot(material.uniforms.uRaising!.value, spotlight.raising);
    invalidate();
  }, [layout, material, invalidate]);

  const socket = readArenaRaisingSocket(breedingPermanents);

  useEffect(() => {
    material.uniforms.uSocket!.value = socket;
    invalidate();
  }, [socket, material, invalidate]);

  useEffect(() => {
    material.uniforms.uRim!.value.set(rimColor);
    invalidate();
  }, [rimColor, material, invalidate]);

  useEffect(() => {
    activity.current.busyUntil = Math.max(activity.current.busyUntil, performance.now() + BUSY_HOLD_MS);
    invalidate();
  }, [active, activity, invalidate]);

  useFrame((state, delta) => {
    const next = stepArenaBreedingFocus({ level: level.current, active, delta, reducedMotion });
    level.current = next;
    const strength = linearBlending ? LINEAR_DIM_STRENGTH : DIM_STRENGTH;
    const eased = next * next * (3 - 2 * next);
    material.uniforms.uStrength!.value = eased * strength;
    material.uniforms.uLevel!.value = eased;
    material.uniforms.uTime!.value = reducedMotion ? 0 : state.clock.elapsedTime;
    if (mesh.current) {
      mesh.current.visible = next > 0;
    }
    if (active && !reducedMotion) {
      activity.current.pacedUntil = Math.max(activity.current.pacedUntil, performance.now() + PACE_HOLD_MS);
    }
    if (next !== (active ? 1 : 0)) {
      activity.current.busyUntil = Math.max(activity.current.busyUntil, performance.now() + BUSY_HOLD_MS);
    }
  });

  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      material={material}
      position-y={FOCUS_HEIGHT}
      renderOrder={FOCUS_RENDER_ORDER}
      frustumCulled={false}
      visible={false}
    />
  );
}
