import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, MeshStandardMaterial, type Group } from "three";
import type { ArenaSideColors } from "@/game/arena3d/ArenaSideColors";

type Props = {
  colors: ArenaSideColors;
  energy: { current: number };
  reducedMotion: boolean;
};

type SpirePlacement = {
  x: number;
  z: number;
  height: number;
  phase: number;
  opponentSide: boolean;
};

const SPIRE_COUNT = 12;
const BACK_ARC_START = Math.PI - 0.35;
const BACK_ARC_LENGTH = Math.PI + 0.7;
const SPIRE_RADIUS_X = 15;
const SPIRE_RADIUS_Z = 11;

function buildPlacements(): SpirePlacement[] {
  return Array.from({ length: SPIRE_COUNT }, (_, index) => {
    const angle = BACK_ARC_START + (index / (SPIRE_COUNT - 1)) * BACK_ARC_LENGTH;
    const z = Math.sin(angle) * SPIRE_RADIUS_Z - 1;
    return {
      x: Math.cos(angle) * SPIRE_RADIUS_X,
      z,
      height: 3 + ((index * 7) % 5) * 0.9,
      phase: index * 1.7,
      opponentSide: index % 2 === 1,
    };
  });
}

export function ArenaSpires({ colors, energy, reducedMotion }: Props) {
  const placements = useMemo(buildPlacements, []);
  const group = useRef<Group>(null);
  const materials = useMemo(
    () => ({
      player: new MeshStandardMaterial({ roughness: 0.25, metalness: 0.6, transparent: true, opacity: 0.85 }),
      opponent: new MeshStandardMaterial({ roughness: 0.25, metalness: 0.6, transparent: true, opacity: 0.85 }),
    }),
    [],
  );

  useEffect(
    () => () => {
      materials.player.dispose();
      materials.opponent.dispose();
    },
    [materials],
  );

  useEffect(() => {
    const base = new Color(colors.surface);
    materials.player.color.copy(base).lerp(new Color(colors.player), 0.25);
    materials.player.emissive.set(colors.player);
    materials.opponent.color.copy(base).lerp(new Color(colors.opponent), 0.25);
    materials.opponent.emissive.set(colors.opponent);
  }, [materials, colors]);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const glow = 0.35 + energy.current * 2.2;
    materials.player.emissiveIntensity = glow + (reducedMotion ? 0 : Math.sin(time * 1.1) * 0.12);
    materials.opponent.emissiveIntensity = glow + (reducedMotion ? 0 : Math.sin(time * 1.1 + 1.6) * 0.12);
    if (!group.current || reducedMotion) {
      return;
    }
    group.current.children.forEach((child, index) => {
      const placement = placements[index]!;
      child.position.y = placement.height / 2 + Math.sin(time * 0.6 + placement.phase) * 0.25;
      child.rotation.y = time * 0.15 + placement.phase;
    });
  });

  return (
    <group ref={group}>
      {placements.map((placement, index) => (
        <mesh
          key={index}
          position={[placement.x, placement.height / 2, placement.z]}
          scale={[1, placement.height / 1.1, 1]}
          material={placement.opponentSide ? materials.opponent : materials.player}
        >
          <octahedronGeometry args={[0.55, 0]} />
        </mesh>
      ))}
    </group>
  );
}
