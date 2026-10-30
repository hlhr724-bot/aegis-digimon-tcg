import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color, NormalBlending, ShaderMaterial, type Group } from "three";
import type { ArenaSideColors } from "@/game/arena3d/ArenaSideColors";
import { SIDE_DEPTH } from "@/game/arena3d/arenaSceneLayout";

type Props = {
  colors: ArenaSideColors;
  activeSide: number;
  reducedMotion: boolean;
};

type SigilProps = {
  color: string;
  accent: string;
  depth: number;
  spin: number;
  active: boolean;
  isLight: boolean;
  reducedMotion: boolean;
};

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform float uTime;
  uniform float uSpin;
  uniform float uPower;
  uniform vec3 uColor;
  uniform vec3 uAccent;
  varying vec2 vUv;
  const float TAU = 6.2831853;

  float band(float value, float center, float width) {
    return 1.0 - smoothstep(0.0, width, abs(value - center));
  }

  void main() {
    vec2 point = vUv * 2.0 - 1.0;
    float radius = length(point);
    if (radius > 1.0) discard;
    float angle = atan(point.y, point.x);
    float outer = band(radius, 0.94, 0.012);
    float inner = band(radius, 0.62, 0.01);
    float runeAngle = angle + uTime * uSpin;
    float runes = band(radius, 0.79, 0.07) * step(0.55, fract(runeAngle * 18.0 / TAU)) * step(0.2, fract(runeAngle * 3.0 / TAU));
    float ticks = band(radius, 0.88, 0.03) * step(0.85, fract((angle - uTime * uSpin * 0.6) * 72.0 / TAU));
    float triangle = 0.0;
    for (int index = 0; index < 3; index++) {
      float rotation = float(index) * TAU / 3.0 - uTime * uSpin * 0.4;
      vec2 direction = vec2(cos(rotation), sin(rotation));
      triangle += band(dot(point, direction), -0.31, 0.008) * step(radius, 0.62);
    }
    float glow = exp(-radius * 3.0) * 0.18;
    float shape = outer + inner * 0.8 + runes * 0.7 + ticks * 0.6 + triangle * 0.5;
    vec3 color = mix(uColor, uAccent, smoothstep(0.5, 1.0, radius));
    float alpha = (shape + glow) * uPower;
    gl_FragColor = vec4(color * (1.0 + uPower), clamp(alpha, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

function Sigil({ color, accent, depth, spin, active, isLight, reducedMotion }: SigilProps) {
  const group = useRef<Group>(null);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uSpin: { value: spin },
          uPower: { value: 0.4 },
          uColor: { value: new Color() },
          uAccent: { value: new Color() },
        },
      }),
    [spin],
  );

  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    material.uniforms.uColor!.value.set(color);
    material.uniforms.uAccent!.value.set(accent);
    material.blending = isLight ? NormalBlending : AdditiveBlending;
    material.needsUpdate = true;
  }, [material, color, accent, isLight]);

  useFrame((state, delta) => {
    const uniforms = material.uniforms;
    const time = state.clock.elapsedTime;
    uniforms.uTime!.value = reducedMotion ? 0 : time;
    const target = active ? 0.5 : 0.2;
    uniforms.uPower!.value += (target - uniforms.uPower!.value) * Math.min(1, delta * 2.5);
    if (group.current && !reducedMotion) {
      group.current.position.y = 0.04 + Math.sin(time * 1.3 + depth) * 0.03;
    }
  });

  return (
    <group ref={group} position={[0, 0.04, depth]}>
      <mesh rotation-x={-Math.PI / 2} material={material}>
        <planeGeometry args={[7.6, 7.6]} />
      </mesh>
    </group>
  );
}

export function ArenaSigils({ colors, activeSide, reducedMotion }: Props) {
  return (
    <>
      <Sigil
        color={colors.player}
        accent={colors.playerAccent}
        depth={SIDE_DEPTH}
        spin={0.18}
        active={activeSide > 0}
        isLight={colors.isLight}
        reducedMotion={reducedMotion}
      />
      <Sigil
        color={colors.opponent}
        accent={colors.opponentAccent}
        depth={-SIDE_DEPTH}
        spin={-0.18}
        active={activeSide < 0}
        isLight={colors.isLight}
        reducedMotion={reducedMotion}
      />
    </>
  );
}
