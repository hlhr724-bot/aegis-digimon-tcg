import type { ArenaRippleBuffer } from "@/game/arena3d/createArenaRippleBuffer";
import type { ArenaSideColors } from "@/game/arena3d/ArenaSideColors";
import { ARENA_FLOOR_PRELUDE_GLSL } from "@/game/arena3d/arenaFloorPreludeGlsl";
import { ArenaShaderFloor } from "@/game/arena3d/ArenaShaderFloor";

type Props = {
  colors: ArenaSideColors;
  ripples: ArenaRippleBuffer;
  activeSide: number;
};

const FRAGMENT_SHADER = `
  ${ARENA_FLOOR_PRELUDE_GLSL}
  const float TAU = 6.2831853;

  float drawLine(float value, float width) {
    float pixel = fwidth(value);
    return 1.0 - smoothstep(width, width + pixel * 1.5, abs(value));
  }

  void main() {
    vec2 point = vWorld.xz;
    float viewerHalf = smoothstep(-0.8, 0.8, point.y);
    vec3 sideColor = mix(uOpponent, uPlayer, viewerHalf);
    vec2 center = point - vec2(0.0, -1.0);
    float radius = length(center * vec2(0.85, 1.0));
    float angle = atan(center.y, center.x);
    vec4 ripple = getArenaRipple(point);

    float ringIndex = floor(radius / 3.2);
    float ringPhase = fract(radius / 3.2) - 0.5;
    float rings = drawLine(ringPhase * 3.2, 0.035) * step(1.0, ringIndex);
    float direction = mod(ringIndex, 2.0) * 2.0 - 1.0;
    float dashes = step(0.35, fract((angle + uTime * 0.03 * direction) * (4.0 + ringIndex * 2.0) / TAU));
    float boldRing = drawLine(radius - 12.8, 0.09);
    float spokes = drawLine(sin(angle * 12.0) * radius * 0.08, 0.012) * smoothstep(5.0, 8.0, radius);
    float pattern = rings * mix(1.0, dashes, step(2.0, ringIndex)) + boldRing + spokes * 0.2;
    pattern *= 1.0 - smoothstep(13.0, 26.0, radius);
    pattern += ripple.a * rings * 1.5;

    vec3 lightBase = mix(vec3(0.98, 0.96, 0.92), vec3(0.93, 0.9, 0.86), smoothstep(0.0, 30.0, radius));
    vec3 darkBase = mix(vec3(0.12, 0.13, 0.2), vec3(0.06, 0.07, 0.11), smoothstep(0.0, 30.0, radius));
    vec3 lightInk = vec3(0.87, 0.45, 0.36);
    vec3 darkInk = vec3(0.96, 0.77, 0.42);
    vec3 base = toLinear(mix(darkBase, lightBase, uLight));
    vec3 ink = toLinear(mix(darkInk, lightInk, uLight));
    float activeBoost = clamp(uActive * (viewerHalf * 2.0 - 1.0), 0.0, 1.0);
    float divider = drawLine(point.y, 0.02) * (1.0 - smoothstep(10.0, 16.0, abs(point.x)));
    vec3 color = mix(base, ink, clamp(pattern * mix(0.75, 0.6, uLight), 0.0, 1.0));
    color = mix(color, sideColor, clamp(divider * 0.6 + activeBoost * rings * 0.25, 0.0, 1.0));
    color += ripple.rgb * mix(1.0, 0.45, uLight);
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

export function ArenaHaloFloor({ colors, ripples, activeSide }: Props) {
  return (
    <ArenaShaderFloor fragmentShader={FRAGMENT_SHADER} colors={colors} ripples={ripples} activeSide={activeSide} />
  );
}
