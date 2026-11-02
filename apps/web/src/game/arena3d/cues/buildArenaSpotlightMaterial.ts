import { Color, ShaderMaterial, Vector2 } from "three";
import { CARD_DIMENSIONS } from "@/design/webglCard/cardDimensions";

const VERTEX_SHADER = `
  varying vec2 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT_SHADER = `
  uniform vec2 uCenter;
  uniform vec2 uHalf;
  uniform float uStrength;
  uniform vec3 uColor;
  varying vec2 vWorld;
  void main() {
    vec2 offset = (vWorld - uCenter) / uHalf;
    float distance = length(offset);
    float shade = smoothstep(1.25, 2.6, distance);
    float alpha = shade * uStrength;
    if (alpha < 0.003) {
      discard;
    }
    gl_FragColor = vec4(uColor, alpha);
    #include <colorspace_fragment>
  }
`;

export function buildArenaSpotlightMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uCenter: { value: new Vector2() },
      uHalf: { value: new Vector2(0.5, 0.5 * CARD_DIMENSIONS.height) },
      uStrength: { value: 0 },
      uColor: { value: new Color("#04060e") },
    },
  });
}
