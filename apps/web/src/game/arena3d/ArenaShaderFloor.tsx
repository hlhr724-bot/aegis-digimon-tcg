import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, ShaderMaterial } from "three";
import type { ArenaRippleBuffer } from "@/game/arena3d/createArenaRippleBuffer";
import type { ArenaSideColors } from "@/game/arena3d/ArenaSideColors";

type Props = {
  fragmentShader: string;
  colors: ArenaSideColors;
  ripples: ArenaRippleBuffer;
  activeSide: number;
};

const FLOOR_SIZE = 90;

const VERTEX_SHADER = `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export function ArenaShaderFloor({ fragmentShader, colors, ripples, activeSide }: Props) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uRipples: { value: ripples.ripples },
          uRippleColors: { value: ripples.colors },
          uSweepStart: { value: -100 },
          uSweepDirection: { value: 1 },
          uSweepColor: { value: ripples.sweepColor },
          uActive: { value: 0 },
          uLight: { value: 0 },
          uSurface: { value: new Color() },
          uPlayer: { value: new Color() },
          uOpponent: { value: new Color() },
        },
      }),
    [fragmentShader, ripples],
  );

  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const uniforms = material.uniforms;
    uniforms.uSurface!.value.set(colors.surface);
    uniforms.uPlayer!.value.set(colors.player);
    uniforms.uOpponent!.value.set(colors.opponent);
    uniforms.uLight!.value = colors.isLight ? 1 : 0;
  }, [material, colors]);

  useFrame((state, delta) => {
    const uniforms = material.uniforms;
    uniforms.uTime!.value = state.clock.elapsedTime;
    uniforms.uSweepStart!.value = ripples.sweepStart;
    uniforms.uSweepDirection!.value = ripples.sweepDirection;
    uniforms.uActive!.value += (activeSide - uniforms.uActive!.value) * Math.min(1, delta * 2);
  });

  return (
    <mesh rotation-x={-Math.PI / 2} material={material}>
      <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE]} />
    </mesh>
  );
}
