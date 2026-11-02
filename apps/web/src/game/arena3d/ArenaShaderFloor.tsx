import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, ShaderMaterial } from "three";
import type { ArenaRippleBuffer } from "@/game/arena3d/createArenaRippleBuffer";
import { isArenaRippleActive } from "@/game/arena3d/isArenaRippleActive";
import type { ArenaSideColors } from "@/game/arena3d/ArenaSideColors";

type Props = {
  fragmentShader: string;
  vertexShader?: string;
  segments?: number;
  waveStrength?: number;
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

export function ArenaShaderFloor({
  fragmentShader,
  vertexShader = VERTEX_SHADER,
  segments = 1,
  waveStrength = 0,
  colors,
  ripples,
  activeSide,
}: Props) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uRipples: { value: ripples.ripples },
          uRippleColors: { value: ripples.colors },
          uSweepStart: { value: -100 },
          uSweepDirection: { value: 1 },
          uSweepColor: { value: ripples.sweepColor },
          uRippleActive: { value: 0 },
          uActive: { value: 0 },
          uLight: { value: 0 },
          uSurface: { value: new Color() },
          uPlayer: { value: new Color() },
          uOpponent: { value: new Color() },
          uWaveStrength: { value: waveStrength },
        },
      }),
    [fragmentShader, vertexShader, ripples],
  );

  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const uniforms = material.uniforms;
    uniforms.uSurface!.value.set(colors.surface);
    uniforms.uPlayer!.value.set(colors.player);
    uniforms.uOpponent!.value.set(colors.opponent);
    uniforms.uLight!.value = colors.isLight ? 1 : 0;
  }, [material, colors]);

  useEffect(() => {
    material.uniforms.uWaveStrength!.value = waveStrength;
  }, [material, waveStrength]);

  useFrame((state, delta) => {
    const uniforms = material.uniforms;
    uniforms.uTime!.value = state.clock.elapsedTime;
    uniforms.uSweepStart!.value = ripples.sweepStart;
    uniforms.uSweepDirection!.value = ripples.sweepDirection;
    uniforms.uRippleActive!.value = isArenaRippleActive({ buffer: ripples, time: state.clock.elapsedTime }) ? 1 : 0;
    uniforms.uActive!.value += (activeSide - uniforms.uActive!.value) * Math.min(1, delta * 0.8);
  });

  return (
    <mesh rotation-x={-Math.PI / 2} material={material} renderOrder={-10}>
      <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE, segments, segments]} />
    </mesh>
  );
}
