import { AdditiveBlending, Color, NormalBlending, ShaderMaterial } from "three";
import { ARENA_MEMORY_TRACK } from "@/game/arena3d/field/arenaWorldLayout";

export const ARENA_MEMORY_MARKER_HALF_SIZE = 1.6;

const VERTEX_SHADER = `
  uniform float uHalfSize;
  uniform float uHeight;
  uniform float uCenter;
  varying vec2 vLocal;
  void main() {
    vLocal = position.xy * 2.0 * uHalfSize;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(uCenter + vLocal.x, uHeight, -vLocal.y, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uRadius;
  uniform float uTime;
  uniform float uRipple;
  uniform float uStrength;
  varying vec2 vLocal;
  void main() {
    float dist = length(vLocal);
    float angle = atan(vLocal.y, vLocal.x);
    float ringRadius = uRadius * 1.42;
    float ring = exp(-pow((dist - ringRadius) / 0.022, 2.0));
    float dashes = smoothstep(0.15, 0.55, sin(angle * 6.0 - uTime * 2.4));
    float halo = exp(-pow(max(dist - uRadius * 0.9, 0.0) / 0.22, 2.0)) * step(uRadius * 0.92, dist);
    float rippleRadius = mix(uRadius, 1.5, uRipple);
    float ripple = exp(-pow((dist - rippleRadius) / mix(0.03, 0.09, uRipple), 2.0)) * (1.0 - uRipple) * step(uRipple, 0.999);
    float alpha = (ring * (0.45 + 0.55 * dashes) + halo * 0.55 + ripple * 1.1) * uStrength;
    if (alpha < 0.003) {
      discard;
    }
    gl_FragColor = vec4(uColor * 1.6 + ripple * 0.35, clamp(alpha, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

export function buildArenaMemoryMarkerMaterial(isLight: boolean): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: isLight ? NormalBlending : AdditiveBlending,
    uniforms: {
      uHalfSize: { value: ARENA_MEMORY_MARKER_HALF_SIZE },
      uHeight: { value: ARENA_MEMORY_TRACK.height * 1.5 },
      uCenter: { value: 0 },
      uColor: { value: new Color() },
      uRadius: { value: ARENA_MEMORY_TRACK.coinRadius },
      uTime: { value: 0 },
      uRipple: { value: 1 },
      uStrength: { value: 1 },
    },
  });
}
