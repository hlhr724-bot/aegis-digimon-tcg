import { Color, ShaderMaterial } from "three";
import { CARD_DIMENSIONS } from "@/design/webglCard/cardDimensions";

const CORNER_RADIUS = 3.2 / CARD_DIMENSIONS.widthMillimeters;
const FRAME_WIDTH = 0.024;

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform vec3 uBaseColor;
  uniform float uShade;
  uniform float uFlash;
  uniform vec3 uFrameColor;
  uniform float uFrameStrength;
  uniform vec3 uRimColor;
  uniform float uRimStrength;
  uniform float uCardHeight;
  uniform float uCornerRadius;
  uniform float uFrameWidth;
  uniform float uTime;
  uniform float uMaterialize;
  uniform vec3 uMaterializeColor;
  varying vec2 vUv;

  float hashCell(vec2 cell) {
    return fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec2 size = vec2(1.0, uCardHeight);
    vec2 centered = (vUv - 0.5) * size;
    vec2 inner = abs(centered) - (size * 0.5 - uCornerRadius);
    float edge = length(max(inner, 0.0)) + min(max(inner.x, inner.y), 0.0) - uCornerRadius;
    if (edge > 0.0) {
      discard;
    }
    vec3 art = uBaseColor;
    if (uHasMap > 0.5) {
      art *= texture2D(uMap, vUv).rgb;
    } else {
      art *= 0.82 + 0.18 * vUv.y;
    }
    vec3 color = art * uShade;
    float smoothing = max(fwidth(edge), 0.002);
    float frame = smoothstep(-uFrameWidth - smoothing, -uFrameWidth + smoothing, edge);
    float hairline = smoothstep(-uFrameWidth - smoothing * 2.5, -uFrameWidth, edge) * (1.0 - frame);
    float pulse = 0.88 + 0.12 * sin(uTime * 2.4);
    float rim = clamp(uRimStrength * pulse, 0.0, 1.0);
    vec3 frameColor = mix(uFrameColor * uShade, uRimColor, rim);
    color *= 1.0 - hairline * 0.35;
    color = mix(color, frameColor, frame * max(uFrameStrength, rim));
    color += vec3(1.0, 0.98, 0.92) * uFlash;
    if (uMaterialize < 1.6) {
      float build = min(uMaterialize, 1.0);
      float front = mix(-0.2, 1.2, build);
      float reveal = vUv.y + hashCell(floor(vUv * vec2(26.0, 36.0))) * 0.14;
      if (reveal > front + 0.1) {
        discard;
      }
      float pending = smoothstep(front - 0.16, front + 0.1, reveal);
      float scan = 0.55 + 0.45 * sin(vUv.y * 240.0);
      float line = 1.0 - smoothstep(0.0, 0.05, abs(reveal - front));
      color = mix(color, uMaterializeColor * scan, pending * 0.8);
      color += uMaterializeColor * line * 0.9;
      float sweep = clamp((uMaterialize - 1.0) / 0.6, 0.0, 1.0);
      float diagonal = (vUv.x + vUv.y * 0.6) / 1.6 - mix(-0.25, 1.25, sweep);
      color += vec3(1.0, 0.98, 0.92) * exp(-diagonal * diagonal * 140.0) * 0.4 * step(0.001, sweep);
    }
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

export function buildArenaCardMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    toneMapped: false,
    uniforms: {
      uMap: { value: null },
      uHasMap: { value: 0 },
      uBaseColor: { value: new Color("#1d3550") },
      uShade: { value: 1 },
      uFlash: { value: 0 },
      uFrameColor: { value: new Color("#0b111c") },
      uFrameStrength: { value: 0 },
      uRimColor: { value: new Color("#ffffff") },
      uRimStrength: { value: 0 },
      uCardHeight: { value: CARD_DIMENSIONS.height },
      uCornerRadius: { value: CORNER_RADIUS },
      uFrameWidth: { value: FRAME_WIDTH },
      uTime: { value: 0 },
      uMaterialize: { value: 1.6 },
      uMaterializeColor: { value: new Color("#8fe9ff") },
    },
  });
}
