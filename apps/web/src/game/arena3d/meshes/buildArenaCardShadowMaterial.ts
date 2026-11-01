import { ShaderMaterial } from "three";
import { CARD_DIMENSIONS } from "@/design/webglCard/cardDimensions";
import { ARENA_CARD_SHADOW_MARGIN } from "@/game/arena3d/meshes/arenaCardGeometry";

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform float uStrength;
  uniform float uSpread;
  varying vec2 vUv;

  void main() {
    vec2 card = vec2(${CARD_DIMENSIONS.width.toFixed(3)}, ${CARD_DIMENSIONS.height.toFixed(3)});
    vec2 size = card + vec2(${(ARENA_CARD_SHADOW_MARGIN * 2).toFixed(3)});
    vec2 centered = (vUv - 0.5) * size;
    vec2 inner = abs(centered) - card * 0.5 * (0.97 + uSpread * 0.2);
    float distanceOut = length(max(inner, 0.0)) + min(max(inner.x, inner.y), 0.0);
    float alpha = (1.0 - smoothstep(-0.04, 0.09 + uSpread * 0.2, distanceOut)) * uStrength;
    gl_FragColor = vec4(0.0, 0.0, 0.02, alpha);
  }
`;

export function buildArenaCardShadowMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uStrength: { value: 0.55 },
      uSpread: { value: 0 },
    },
  });
}
