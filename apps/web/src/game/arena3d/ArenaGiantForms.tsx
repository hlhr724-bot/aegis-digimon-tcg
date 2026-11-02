import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, MeshLambertMaterial, NormalBlending, type Group } from "three";

type Props = {
  isLight: boolean;
  energy: { current: number };
  reducedMotion: boolean;
};

const FORM_HEIGHTS = [2.2, 2.6, 1.8] as const;

export function ArenaGiantForms({ isLight, energy, reducedMotion }: Props) {
  const forms = useRef<Group>(null);
  const materials = useMemo(
    () => ({
      warm: new MeshLambertMaterial({ transparent: true, depthWrite: false, flatShading: true }),
      cool: new MeshLambertMaterial({ transparent: true, depthWrite: false, flatShading: true }),
    }),
    [],
  );

  useEffect(
    () => () => {
      materials.warm.dispose();
      materials.cool.dispose();
    },
    [materials],
  );

  useEffect(() => {
    materials.warm.color.set(isLight ? "#ff8fb8" : "#b45cff");
    materials.cool.color.set(isLight ? "#6fc8ff" : "#2fd6e8");
    for (const material of [materials.warm, materials.cool]) {
      material.emissive.copy(material.color).multiplyScalar(isLight ? 0.25 : 0.5);
      material.blending = isLight ? NormalBlending : AdditiveBlending;
      material.needsUpdate = true;
    }
  }, [materials, isLight]);

  useFrame((state) => {
    const opacity = (isLight ? 0.32 : 0.22) + energy.current * 0.2;
    materials.warm.opacity = opacity;
    materials.cool.opacity = opacity;
    if (!forms.current || reducedMotion) {
      return;
    }
    const time = state.clock.elapsedTime;
    forms.current.children.forEach((child, index) => {
      child.rotation.y = time * (0.05 + index * 0.02);
      child.rotation.x = Math.sin(time * 0.1 + index) * 0.3;
      child.position.y = FORM_HEIGHTS[index]! + Math.sin(time * 0.3 + index * 2) * 0.4;
    });
  });

  return (
    <group ref={forms}>
      <mesh position={[-12.5, FORM_HEIGHTS[0], -11]} material={materials.warm}>
        <icosahedronGeometry args={[3, 0]} />
      </mesh>
      <mesh position={[12.5, FORM_HEIGHTS[1], -10]} material={materials.cool}>
        <torusGeometry args={[2.6, 0.6, 6, 24]} />
      </mesh>
      <mesh position={[1, FORM_HEIGHTS[2], -17]} material={materials.warm}>
        <tetrahedronGeometry args={[3.2, 0]} />
      </mesh>
    </group>
  );
}
