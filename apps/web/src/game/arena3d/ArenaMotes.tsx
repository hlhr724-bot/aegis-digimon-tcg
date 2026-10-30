import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, NormalBlending, ShaderMaterial } from "three";
import type { ArenaMoteStyle } from "@/game/arena3d/ArenaMoteStyle";

type Props = {
  primary: string;
  secondary: string;
  isLight: boolean;
  energy: { current: number };
  reducedMotion: boolean;
  moteStyle: ArenaMoteStyle;
};

const FIELD_WIDTH = 34;
const FIELD_DEPTH = 26;
const FIELD_HEIGHT = 9;

const VERTEX_SHADER = `
  uniform float uTime;
  uniform float uEnergy;
  uniform float uPixelRatio;
  uniform float uRiseSpeed;
  uniform float uSize;
  uniform float uSway;
  attribute float aSeed;
  varying float vSeed;
  varying float vAlpha;
  void main() {
    vec3 point = position;
    float rise = mod(point.y + uTime * (0.25 + aSeed * 0.45) * uRiseSpeed, ${FIELD_HEIGHT.toFixed(1)});
    point.y = rise;
    point.x += sin(uTime * 0.4 + aSeed * 40.0) * 0.5 * uSway;
    point.z += cos(uTime * 0.3 + aSeed * 25.0) * 0.4 * uSway;
    vec4 view = modelViewMatrix * vec4(point, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = (14.0 + aSeed * 22.0) * uSize * (1.0 + uEnergy) * uPixelRatio / -view.z;
    vSeed = aSeed;
    vAlpha = smoothstep(0.0, 1.2, rise) * (1.0 - smoothstep(${(FIELD_HEIGHT - 3).toFixed(1)}, ${FIELD_HEIGHT.toFixed(1)}, rise));
  }
`;

const FRAGMENT_SHADER = `
  uniform vec3 uPlayer;
  uniform vec3 uOpponent;
  uniform float uEnergy;
  uniform float uBrightness;
  varying float vSeed;
  varying float vAlpha;
  void main() {
    float distanceToCenter = length(gl_PointCoord - 0.5);
    float soft = smoothstep(0.5, 0.0, distanceToCenter);
    vec3 color = mix(uPlayer, uOpponent, step(0.5, vSeed));
    gl_FragColor = vec4(color * (uBrightness + uEnergy * 2.0), soft * vAlpha * (0.55 + uEnergy * 0.4));
    #include <colorspace_fragment>
  }
`;

function buildGeometry(count: number): BufferGeometry {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let index = 0; index < count; index++) {
    positions[index * 3] = (Math.random() - 0.5) * FIELD_WIDTH;
    positions[index * 3 + 1] = Math.random() * FIELD_HEIGHT;
    positions[index * 3 + 2] = (Math.random() - 0.5) * FIELD_DEPTH - 2;
    seeds[index] = Math.random();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new BufferAttribute(seeds, 1));
  return geometry;
}

export function ArenaMotes({ primary, secondary, isLight, energy, reducedMotion, moteStyle }: Props) {
  const geometry = useMemo(() => buildGeometry(moteStyle.count), [moteStyle.count]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uEnergy: { value: 0 },
          uPixelRatio: { value: 1 },
          uRiseSpeed: { value: 1 },
          uSize: { value: 1 },
          uSway: { value: 1 },
          uBrightness: { value: 1.4 },
          uPlayer: { value: new Color() },
          uOpponent: { value: new Color() },
        },
      }),
    [],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useEffect(() => {
    const uniforms = material.uniforms;
    uniforms.uPlayer!.value.set(primary);
    uniforms.uOpponent!.value.set(secondary);
    uniforms.uRiseSpeed!.value = moteStyle.riseSpeed;
    uniforms.uSize!.value = moteStyle.size;
    uniforms.uSway!.value = moteStyle.sway;
    uniforms.uBrightness!.value = moteStyle.brightness;
    material.blending = isLight ? NormalBlending : AdditiveBlending;
    material.needsUpdate = true;
  }, [material, primary, secondary, isLight, moteStyle]);

  useFrame((state, delta) => {
    const uniforms = material.uniforms;
    uniforms.uPixelRatio!.value = state.gl.getPixelRatio() * 4;
    uniforms.uEnergy!.value = energy.current;
    if (!reducedMotion) {
      uniforms.uTime!.value += delta * (1 + energy.current * 3);
    }
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}
