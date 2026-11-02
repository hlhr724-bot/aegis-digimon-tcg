import { AdditiveBlending, Color, ShaderMaterial, Vector2 } from "three";
import { CARD_DIMENSIONS } from "@/design/webglCard/cardDimensions";
import { ARENA_CARD_GLOW_MARGIN } from "@/game/arena3d/meshes/arenaCardGeometry";

const CORNER_RADIUS = 3.2 / CARD_DIMENSIONS.widthMillimeters;

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uStrength;
  uniform float uOutline;
  uniform float uTime;
  uniform float uLight;
  uniform vec2 uCard;
  uniform float uMargin;
  uniform float uCornerRadius;
  varying vec2 vUv;

  void main() {
    vec2 size = uCard + vec2(uMargin * 2.0);
    vec2 centered = (vUv - 0.5) * size;
    vec2 inner = abs(centered) - (uCard * 0.5 - uCornerRadius);
    float distanceOut = length(max(inner, 0.0)) + min(max(inner.x, inner.y), 0.0) - uCornerRadius;
    if (distanceOut < 0.0) {
      discard;
    }
    float smoothing = max(fwidth(distanceOut), 0.002);
    float outline = (1.0 - smoothstep(0.022, 0.022 + smoothing * 1.5, distanceOut)) * uOutline;
    float halo = exp(-distanceOut * mix(6.5, 11.0, uOutline)) * 0.55;
    float pulse = mix(1.0, 0.85 + 0.15 * sin(uTime * 2.4), uOutline);
    float haloBoost = mix(1.0, 2.2, uLight * (1.0 - uOutline));
    float alpha = (outline + halo * pulse * haloBoost) * uStrength;
    vec3 color = mix(uColor * 1.25, uColor * 0.85, uLight);
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

export function buildArenaCardGlowMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: AdditiveBlending,
    uniforms: {
      uColor: { value: new Color("#ffffff") },
      uStrength: { value: 0 },
      uOutline: { value: 1 },
      uTime: { value: 0 },
      uLight: { value: 0 },
      uCard: { value: new Vector2(CARD_DIMENSIONS.width, CARD_DIMENSIONS.height) },
      uMargin: { value: ARENA_CARD_GLOW_MARGIN },
      uCornerRadius: { value: CORNER_RADIUS },
    },
  });
}
