import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color, ShaderMaterial } from "three";

type Props = {
  energy: number;
  reducedMotion: boolean;
};

const VERTEX_SHADER = `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT_SHADER = `
  uniform float uTime;
  uniform float uEnergy;
  uniform vec3 uColor;
  varying vec3 vWorld;
  float gridLine(float coordinate, float width) {
    float cell = abs(fract(coordinate) - 0.5);
    float derivative = max(fwidth(coordinate), 0.0001);
    float line = 1.0 - smoothstep(width * 0.5 - derivative, width * 0.5 + derivative, 0.5 - cell);
    return line * (1.0 - smoothstep(0.08, 0.3, derivative));
  }
  void main() {
    vec2 coordinate = vWorld.xz * 0.9 + vec2(0.0, uTime * 0.2);
    float line = max(gridLine(coordinate.x, 0.04), gridLine(coordinate.y, 0.04));
    float distanceFade = 1.0 - smoothstep(4.0, 22.0, length(vWorld.xz - vec2(0.0, 2.0)));
    float pulse = 0.55 + 0.45 * sin(uTime * 2.0 - length(vWorld.xz) * 0.8) * uEnergy;
    float alpha = line * distanceFade * (0.08 + pulse * 0.12);
    gl_FragColor = vec4(uColor * (1.2 + uEnergy * 1.6), clamp(alpha, 0.0, 1.0));
  }
`;

export function NeonGrid({ energy, reducedMotion }: Props) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uEnergy: { value: 0 },
          uColor: { value: new Color("#6486b8") },
        },
      }),
    [],
  );

  useFrame((state, delta) => {
    const uniforms = material.uniforms;
    if (!reducedMotion) {
      uniforms.uTime!.value = state.clock.elapsedTime;
    }
    uniforms.uEnergy!.value += (energy - uniforms.uEnergy!.value) * Math.min(1, delta * 4);
  });

  return (
    <mesh rotation-x={-Math.PI / 2} material={material}>
      <planeGeometry args={[80, 80]} />
    </mesh>
  );
}
