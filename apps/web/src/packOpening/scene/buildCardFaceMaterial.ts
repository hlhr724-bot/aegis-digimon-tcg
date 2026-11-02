import { Color, ShaderMaterial, Vector2 } from "three";
import type { CardFinishEntry } from "@/packOpening/CardFinish";
import { CARD_DIMENSIONS } from "@/packOpening/scene/cardDimensions";
import { FOIL_SHADER_CHUNK } from "@/packOpening/scene/foilShaderChunk";

type Params = {
  finish: CardFinishEntry;
  glowColor: string | undefined;
};

const CORNER_RADIUS = 3 / CARD_DIMENSIONS.widthMillimeters;

const VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;
  void main() {
    vUv = uv;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = viewPosition.xyz;
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const FRAGMENT_SHADER = `
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform vec3 uBaseColor;
  uniform int uFinish;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform vec3 uGlowColor;
  uniform float uReveal;
  uniform float uCardHeight;
  uniform float uCornerRadius;
  varying vec2 vUv;
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;

  ${FOIL_SHADER_CHUNK}

  vec3 screenBlend(vec3 base, vec3 layer, float amount) {
    return mix(base, 1.0 - (1.0 - base) * (1.0 - layer), clamp(amount, 0.0, 1.0));
  }

  void main() {
    vec2 size = vec2(1.0, uCardHeight);
    vec2 centered = (vUv - 0.5) * size;
    vec2 inner = abs(centered) - (size * 0.5 - uCornerRadius);
    float edge = length(max(inner, 0.0)) + min(max(inner.x, inner.y), 0.0) - uCornerRadius;
    if (edge > 0.0) {
      discard;
    }

    vec3 base = uBaseColor;
    if (uHasMap > 0.5) {
      vec4 texel = texture2D(uMap, vUv);
      if (texel.a < 0.5) {
        discard;
      }
      base *= texel.rgb;
    }
    vec3 color = base;

    if (uFinish > 0) {
      vec3 view = normalize(-vViewPosition);
      vec3 normal = normalize(vViewNormal);
      vec3 reflected = reflect(-view, normal);
      vec2 tilt = reflected.xy * 2.4 + uPointer * 0.45;
      float diagonal = dot(centered, vec2(0.62, 0.78));
      float artMask = mix(0.3, 1.0, smoothstep(0.34, 0.42, vUv.y));
      float lightBand = exp(-pow((diagonal - tilt.x * 0.55 - tilt.y * 0.35) * 3.2, 2.0));
      float twinklePhase = uTime + tilt.x * 4.0 + tilt.y * 3.0;
      float rimDistance = -edge;
      float perimeterAngle = atan(centered.y, centered.x);
      float runner = pow(0.5 + 0.5 * sin(perimeterAngle * 2.0 - uTime * 2.4), 10.0);
      vec3 rimColor = uGlowColor;
      float rimStrength = 0.0;

      if (uFinish == 1) {
        vec3 rainbow = foilSpectrum(diagonal * 1.4 + tilt.x * 0.8 + tilt.y * 0.5);
        color = screenBlend(color, rainbow, lightBand * 0.1 * artMask);
        color += vec3(0.9, 0.95, 1.0) * lightBand * 0.07 * artMask;
      } else if (uFinish == 2) {
        float stripes = sin((centered.x + centered.y * 0.4) * 140.0) * 0.04;
        vec3 rainbow = foilSpectrum(diagonal * 2.6 + stripes + tilt.x * 1.1 + tilt.y * 0.7);
        color = screenBlend(color, rainbow, lightBand * 0.14 * artMask);
        color += vec3(1.0) * lightBand * 0.08 * artMask;
        float sparkles = foilSparkle(vUv * size, 9.0, 3.1, twinklePhase);
        color += mix(vec3(1.0), rainbow, 0.25) * sparkles * (0.5 + lightBand) * 1.1 * artMask;
        rimStrength = 0.35;
      } else if (uFinish == 3) {
        float radius = length(centered);
        float angle = atan(centered.y, centered.x);
        float brushed = 0.5 + 0.5 * sin(radius * 260.0 - tilt.x * 18.0) * sin(angle * 90.0);
        vec3 gold = mix(vec3(1.0, 0.68, 0.22), vec3(1.0, 0.96, 0.78), brushed * 0.6 + lightBand * 0.4);
        vec3 rainbow = foilSpectrum(radius * 2.2 + tilt.x * 0.9 - tilt.y * 0.6);
        color = screenBlend(color, gold * (0.55 + 0.45 * brushed), 0.16 * artMask);
        color = screenBlend(color, rainbow, lightBand * 0.08 * artMask);
        color += gold * lightBand * 0.25 * artMask;
        float sparkles = foilSparkle(vUv * size, 10.0, 5.3, twinklePhase);
        color += vec3(1.0, 0.85, 0.5) * sparkles * (0.5 + lightBand) * 1.3 * artMask;
        rimColor = vec3(1.0, 0.78, 0.35);
        rimStrength = 0.6;
      } else {
        vec3 cell = foilHexCell(vUv * size * 15.0);
        float cellRandom = foilHash(cell.xy);
        float facet = pow(0.5 + 0.5 * sin(cellRandom * 6.28318 + tilt.x * 6.0 + tilt.y * 4.0 + uTime * 0.5), 3.0);
        vec3 rainbow = foilSpectrum(diagonal * 1.8 + cellRandom * 0.25 + tilt.x * 1.2 + tilt.y * 0.8 + uTime * 0.04);
        float hexLines = smoothstep(0.04, 0.0, cell.z);
        float textMask = mix(0.5, 1.0, artMask);
        color = screenBlend(color, rainbow, (0.1 + facet * 0.16 + lightBand * 0.12) * textMask);
        color += rainbow * hexLines * (0.03 + facet * 0.08) * textMask;
        color += vec3(1.0) * lightBand * 0.12 * textMask;
        float sparkles = foilSparkle(vUv * size, 8.0, 1.9, twinklePhase);
        color += mix(vec3(1.0), rainbow, 0.45) * sparkles * (0.4 + lightBand) * 0.9 * textMask;
        rimColor = foilSpectrum(perimeterAngle / 6.28318 + uTime * 0.15);
        rimStrength = 0.55;
      }

      float rim = smoothstep(0.03, 0.0, rimDistance);
      color += rimColor * rim * (0.25 + runner * 2.6) * rimStrength;

      if (uReveal >= 0.0 && uReveal < 1.0) {
        float sweepCenter = mix(-1.1, 1.1, uReveal);
        float sweep = exp(-pow((diagonal - sweepCenter) * 7.0, 2.0));
        color += mix(vec3(1.0), uGlowColor, 0.3) * sweep * 2.4 * (1.0 - uReveal * 0.5);
      }
    }

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function buildCardFaceMaterial({ finish, glowColor }: Params): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      uMap: { value: null },
      uHasMap: { value: 0 },
      uBaseColor: { value: new Color("#16324d") },
      uFinish: { value: finish.shaderIndex },
      uTime: { value: 0 },
      uPointer: { value: new Vector2() },
      uGlowColor: { value: new Color(glowColor ?? "#ffffff") },
      uReveal: { value: -1 },
      uCardHeight: { value: CARD_DIMENSIONS.height },
      uCornerRadius: { value: CORNER_RADIUS },
    },
  });
}
