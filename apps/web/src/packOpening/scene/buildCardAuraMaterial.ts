import { AdditiveBlending, Color, ShaderMaterial } from "three";
import { CARD_DIMENSIONS } from "@/packOpening/scene/cardDimensions";
import { FOIL_SHADER_CHUNK } from "@/packOpening/scene/foilShaderChunk";

type Params = {
  glowColor: string | undefined;
  prismatic: boolean;
  size: number;
};

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uPrismatic;
  uniform float uSize;
  uniform float uCardHeight;
  uniform float uTime;
  uniform float uHalo;
  uniform float uRays;
  uniform float uBurst;
  varying vec2 vUv;

  ${FOIL_SHADER_CHUNK}

  void main() {
    vec2 point = (vUv - 0.5) * uSize;
    vec2 inner = abs(point) - vec2(0.5, uCardHeight * 0.5) + 0.05;
    float box = length(max(inner, 0.0)) + min(max(inner.x, inner.y), 0.0) - 0.05;
    float radius = length(point);
    float angle = atan(point.y, point.x);

    float halo = exp(-max(box, 0.0) * 9.0) * 0.9 + exp(-max(box, 0.0) * 2.6) * 0.35;
    float rays = pow(0.5 + 0.5 * sin(angle * 9.0 + uTime * 0.35), 5.0) * 0.65
      + pow(0.5 + 0.5 * sin(angle * 17.0 - uTime * 0.55 + 1.3), 9.0) * 0.5
      + pow(0.5 + 0.5 * sin(angle * 31.0 + uTime * 0.8), 16.0) * 0.3;
    rays *= smoothstep(0.35, 1.0, radius) * exp(-radius * 0.75);
    float burstRadius = uBurst * uSize * 0.5;
    float ring = exp(-pow((radius - burstRadius) * 5.0, 2.0)) * (1.0 - uBurst) * step(0.0, uBurst) * step(uBurst, 1.0);
    float edgeFade = smoothstep(uSize * 0.5, uSize * 0.32, radius);

    vec3 tint = mix(uColor, foilSpectrum(angle / 6.28318 + radius * 0.18 - uTime * 0.12), uPrismatic);
    vec3 glow = tint * (halo * uHalo * 1.1 + rays * uRays * 0.9) + mix(vec3(1.0), tint, 0.5) * ring * 2.2;
    gl_FragColor = vec4(glow * edgeFade, 1.0);
  }
`;

export function buildCardAuraMaterial({ glowColor, prismatic, size }: Params): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uColor: { value: new Color(glowColor ?? "#ffffff") },
      uPrismatic: { value: prismatic ? 1 : 0 },
      uSize: { value: size },
      uCardHeight: { value: CARD_DIMENSIONS.height },
      uTime: { value: 0 },
      uHalo: { value: 0 },
      uRays: { value: 0 },
      uBurst: { value: -1 },
    },
  });
}
