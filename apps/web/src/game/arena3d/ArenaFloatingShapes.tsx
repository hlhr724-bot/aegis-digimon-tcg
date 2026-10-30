import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, MeshLambertMaterial, Object3D, type InstancedMesh } from "three";
import { createSeededRandom } from "@/game/arena3d/createSeededRandom";

type Props = {
  isLight: boolean;
  energy: { current: number };
  reducedMotion: boolean;
};

type Shape = {
  x: number;
  y: number;
  z: number;
  size: number;
  phase: number;
  spin: number;
  colorIndex: number;
};

type ShapeMeshProps = {
  shapes: readonly Shape[];
  palette: readonly string[];
  material: MeshLambertMaterial;
  reducedMotion: boolean;
  energy: { current: number };
  children: ReactNode;
};

const SHAPES_PER_KIND = 8;
const ARC_START = Math.PI + 0.15;
const ARC_LENGTH = Math.PI - 0.3;
const LIGHT_COLORS = ["#b9a6ff", "#ffb9a0", "#8fded2", "#ffd98a", "#f7a8d0"] as const;
const DARK_COLORS = ["#7c5cff", "#ff7a59", "#2fc4b2", "#f2b33d", "#e45aa0"] as const;

function buildShapes(seed: number): Shape[] {
  const random = createSeededRandom(seed);
  return Array.from({ length: SHAPES_PER_KIND }, (_, index) => {
    const angle = ARC_START + ((index + random() * 0.8) / SHAPES_PER_KIND) * ARC_LENGTH;
    const radius = 10 + random() * 3.5;
    return {
      x: Math.cos(angle) * radius * 1.15,
      y: 1 + random() * 2.2,
      z: Math.sin(angle) * radius * 0.85 - 2,
      size: 0.5 + random() * 0.8,
      phase: random() * Math.PI * 2,
      spin: (random() - 0.5) * 0.5,
      colorIndex: Math.floor(random() * LIGHT_COLORS.length),
    };
  });
}

function ShapeMesh({ shapes, palette, material, reducedMotion, energy, children }: ShapeMeshProps) {
  const mesh = useRef<InstancedMesh>(null);
  const transform = useMemo(() => new Object3D(), []);

  useLayoutEffect(() => {
    const target = mesh.current;
    if (!target) {
      return;
    }
    const color = new Color();
    shapes.forEach((shape, index) => {
      target.setColorAt(index, color.set(palette[shape.colorIndex]!));
    });
    if (target.instanceColor) {
      target.instanceColor.needsUpdate = true;
    }
  }, [shapes, palette]);

  useFrame((state) => {
    const target = mesh.current;
    if (!target) {
      return;
    }
    const time = reducedMotion ? 0 : state.clock.elapsedTime;
    const lift = 1 + energy.current * 0.15;
    shapes.forEach((shape, index) => {
      transform.position.set(shape.x, shape.y + Math.sin(time * 0.5 + shape.phase) * 0.4, shape.z);
      transform.rotation.set(time * shape.spin + shape.phase, time * shape.spin * 1.3, shape.phase);
      transform.scale.setScalar(shape.size * lift);
      transform.updateMatrix();
      target.setMatrixAt(index, transform.matrix);
    });
    target.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, shapes.length]} material={material} frustumCulled={false}>
      {children}
    </instancedMesh>
  );
}

export function ArenaFloatingShapes({ isLight, energy, reducedMotion }: Props) {
  const octahedrons = useMemo(() => buildShapes(11), []);
  const cubes = useMemo(() => buildShapes(23), []);
  const rings = useMemo(() => buildShapes(37), []);
  const palette = isLight ? LIGHT_COLORS : DARK_COLORS;
  const material = useMemo(() => new MeshLambertMaterial({ flatShading: true }), []);

  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    material.emissive.set(isLight ? "#000000" : "#1a1030");
  }, [material, isLight]);

  return (
    <>
      <ShapeMesh
        shapes={octahedrons}
        palette={palette}
        material={material}
        reducedMotion={reducedMotion}
        energy={energy}
      >
        <octahedronGeometry args={[1, 0]} />
      </ShapeMesh>
      <ShapeMesh shapes={cubes} palette={palette} material={material} reducedMotion={reducedMotion} energy={energy}>
        <boxGeometry args={[1.1, 1.1, 1.1]} />
      </ShapeMesh>
      <ShapeMesh shapes={rings} palette={palette} material={material} reducedMotion={reducedMotion} energy={energy}>
        <torusGeometry args={[0.9, 0.22, 6, 18]} />
      </ShapeMesh>
    </>
  );
}
