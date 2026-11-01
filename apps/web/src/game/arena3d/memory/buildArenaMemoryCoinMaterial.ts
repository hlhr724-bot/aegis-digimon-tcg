import { Color, ShaderMaterial, type Texture } from "three";
import { ARENA_MEMORY_TRACK } from "@/game/arena3d/field/arenaWorldLayout";
import { ARENA_MEMORY_DIGIT_CELLS } from "@/game/arena3d/memory/createArenaMemoryDigitAtlas";

const VERTEX_SHADER = `
  attribute float aValue;
  uniform float uSpacing;
  uniform float uHeight;
  uniform float uMarker;
  varying vec2 vLocal;
  varying float vValue;
  varying float vMarker;
  void main() {
    vValue = aValue;
    vMarker = 1.0 - smoothstep(0.0, 1.0, abs(aValue - uMarker));
    vLocal = position.xy * uSpacing;
    vec3 world = vec3(-aValue * uSpacing + vLocal.x, uHeight, -vLocal.y);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(world, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform sampler2D uDigits;
  uniform vec3 uPlayer;
  uniform vec3 uOpponent;
  uniform vec3 uZero;
  uniform vec3 uBase;
  uniform vec3 uZeroInk;
  uniform float uRadius;
  uniform float uMarkerScale;
  uniform float uPrediction;
  uniform float uTime;
  uniform float uCells;
  varying vec2 vLocal;
  varying float vValue;
  varying float vMarker;

  vec3 getSideColor(float value) {
    if (value > 0.5) {
      return uPlayer;
    }
    if (value < -0.5) {
      return uOpponent;
    }
    return uZero;
  }

  void main() {
    float radius = uRadius * mix(1.0, uMarkerScale, vMarker);
    float dist = length(vLocal);
    float edgeWidth = fwidth(dist) * 1.25;
    float disc = 1.0 - smoothstep(radius - edgeWidth, radius + edgeWidth, dist);
    float predicted = 1.0 - step(0.5, abs(vValue - uPrediction));
    float ringGap = abs(dist - uRadius * 1.16);
    float ring = predicted * (1.0 - smoothstep(0.006, 0.024, ringGap)) * (0.6 + 0.4 * sin(uTime * 6.0));
    if (disc + ring < 0.002) {
      discard;
    }
    bool isZero = abs(vValue) < 0.5;
    vec3 side = getSideColor(vValue);
    vec3 idle = isZero ? uZero * 0.82 : mix(uBase, side, 0.4);
    vec3 lit = isZero ? uZero : side * 1.18;
    vec3 fill = mix(idle, lit, vMarker);
    float bevel = smoothstep(radius * 0.6, radius, dist);
    fill *= 1.0 - bevel * 0.32;
    float rim = smoothstep(radius * 0.8, radius * 0.88, dist) * (1.0 - smoothstep(radius * 0.9, radius, dist));
    fill += rim * mix(0.08, 0.55, vMarker);
    vec2 glyphUv = vLocal / (radius * 1.7) + 0.5;
    float inside = step(0.0, glyphUv.x) * step(glyphUv.x, 1.0) * step(0.0, glyphUv.y) * step(glyphUv.y, 1.0);
    float digit = floor(abs(vValue) + 0.5);
    float glyph = texture2D(uDigits, vec2((digit + clamp(glyphUv.x, 0.0, 1.0)) / uCells, glyphUv.y)).a * inside;
    vec3 ink = isZero ? uZeroInk : vec3(1.0);
    fill = mix(fill, ink, glyph * mix(0.82, 1.0, vMarker));
    vec3 ringColor = getSideColor(uPrediction) * 1.6 + 0.25;
    vec3 color = mix(ringColor, fill, disc);
    gl_FragColor = vec4(color, max(disc, ring));
    #include <colorspace_fragment>
  }
`;

export function buildArenaMemoryCoinMaterial(digits: Texture): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uDigits: { value: digits },
      uPlayer: { value: new Color() },
      uOpponent: { value: new Color() },
      uZero: { value: new Color("#e8ecf4") },
      uBase: { value: new Color("#151c30") },
      uZeroInk: { value: new Color("#161c2e") },
      uSpacing: { value: ARENA_MEMORY_TRACK.coinSpacing },
      uHeight: { value: ARENA_MEMORY_TRACK.height },
      uRadius: { value: ARENA_MEMORY_TRACK.coinRadius },
      uMarkerScale: { value: ARENA_MEMORY_TRACK.markerScale },
      uMarker: { value: 0 },
      uPrediction: { value: 99 },
      uTime: { value: 0 },
      uCells: { value: ARENA_MEMORY_DIGIT_CELLS },
    },
  });
}
