import type { ArenaRippleBuffer } from "@/game/arena3d/createArenaRippleBuffer";
import type { ArenaSideColors } from "@/game/arena3d/ArenaSideColors";
import { ARENA_FLOOR_PRELUDE_GLSL } from "@/game/arena3d/arenaFloorPreludeGlsl";
import { ARENA_RIPPLE_GLSL } from "@/game/arena3d/arenaRippleGlsl";
import { ArenaShaderFloor } from "@/game/arena3d/ArenaShaderFloor";
import type { Arena3dQualityEntry } from "@/game/arena3d/quality/Arena3dQuality";

type Props = {
  colors: ArenaSideColors;
  ripples: ArenaRippleBuffer;
  activeSide: number;
  quality: Arena3dQualityEntry;
};

const WAVE_VERTEX_SHADER = `
  ${ARENA_RIPPLE_GLSL}
  uniform float uWaveStrength;
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec4 ripple = getArenaRipple(world.xz);
    world.y += ripple.a * 0.12 * uWaveStrength;
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT_SHADER = `
  ${ARENA_FLOOR_PRELUDE_GLSL}
  const float TAU = 6.2831853;
  const float ARENA_RADIUS = 8.6;

  float drawLine(float value, float width) {
    float pixel = fwidth(value);
    return 1.0 - smoothstep(width, width + pixel * 1.5, abs(value));
  }

  float getHexDistance(vec2 point) {
    vec2 ratio = vec2(1.0, 1.7320508);
    vec2 halfRatio = ratio * 0.5;
    vec2 first = mod(point, ratio) - halfRatio;
    vec2 second = mod(point - halfRatio, ratio) - halfRatio;
    vec2 cell = dot(first, first) < dot(second, second) ? first : second;
    vec2 folded = abs(cell);
    return 0.5 - max(dot(folded, normalize(ratio)), folded.x);
  }

  void main() {
    vec2 point = vWorld.xz;
    float radius = length(point * vec2(0.78, 1.0));
    float angle = atan(point.y, point.x);
    vec4 ripple = getArenaRipple(point);
    float arena = 1.0 - smoothstep(ARENA_RADIUS - 0.3, ARENA_RADIUS + 0.3, radius);
    float viewerHalf = smoothstep(-0.6, 0.6, point.y);

    vec3 darkBase = mix(vec3(0.05, 0.08, 0.17), vec3(0.015, 0.02, 0.055), smoothstep(0.0, 20.0, radius));
    vec3 lightBase = mix(vec3(0.94, 0.96, 1.0), vec3(0.82, 0.86, 0.94), smoothstep(0.0, 20.0, radius));
    vec3 base = toLinear(mix(darkBase, lightBase, uLight));
    vec3 player = toLinear(uPlayer);
    vec3 opponent = toLinear(uOpponent);
    vec3 sideInk = mix(opponent, player, viewerHalf);

    float hex = getHexDistance(point * 0.95);
    float hexLine = (1.0 - smoothstep(0.0, 0.025 + fwidth(hex) * 1.5, hex)) * arena;
    float outerRing = drawLine(radius - ARENA_RADIUS, 0.06);
    float midRing = drawLine(radius - 6.0, 0.025) * step(0.5, fract(angle * 24.0 / TAU));
    float innerRing = drawLine(radius - 1.7, 0.04);
    float ticks = drawLine(radius - (ARENA_RADIUS - 0.5), 0.14) * step(0.85, fract(angle * 72.0 / TAU));
    float centerLine = drawLine(point.y, 0.035) * (1.0 - smoothstep(7.0, 9.5, abs(point.x)));
    float breathing = 0.5 + 0.5 * sin(radius * 0.8);
    float rimGlow = exp(-max(0.0, radius - ARENA_RADIUS) * 0.55) * (1.0 - arena);

    vec3 ink = toLinear(mix(vec3(0.45, 0.85, 1.0), vec3(0.2, 0.42, 0.85), uLight));
    vec3 color = base + sideInk * 0.015 * arena;
    color += ink * hexLine * (0.018 + breathing * 0.022 + ripple.a * 0.45);
    color += ink * (outerRing * 0.9 + midRing * 0.32 + innerRing * 0.45 + ticks * 0.4);
    color += sideInk * centerLine * 0.85;
    color += toLinear(vec3(0.25, 0.9, 0.85)) * rimGlow * mix(0.32, 0.18, uLight);
    color += ripple.rgb * mix(0.7, 0.35, uLight);
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

export function ArenaHologramFloor({ colors, ripples, activeSide, quality }: Props) {
  return (
    <ArenaShaderFloor
      fragmentShader={FRAGMENT_SHADER}
      vertexShader={quality.floorWave ? WAVE_VERTEX_SHADER : undefined}
      segments={quality.floorSegments}
      waveStrength={quality.floorWave ? 1 : 0}
      colors={colors}
      ripples={ripples}
      activeSide={activeSide}
    />
  );
}
