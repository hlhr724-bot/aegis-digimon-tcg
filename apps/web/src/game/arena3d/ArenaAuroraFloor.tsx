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

  void main() {
    vec2 point = vWorld.xz;
    float viewerHalf = smoothstep(-0.8, 0.8, point.y);
    vec3 sideColor = mix(uOpponent, uPlayer, viewerHalf);
    float wave = fbm(point * 0.05 + vec2(uTime * 0.02, -uTime * 0.015));
    float blend = clamp(0.5 + (point.x * 0.03 - point.y * 0.035) + (wave - 0.5) * 0.9, 0.0, 1.0);
    vec3 lightColor = mix(vec3(1.0, 0.68, 0.8), vec3(0.6, 0.86, 1.0), blend);
    vec3 darkColor = mix(vec3(0.3, 0.1, 0.42), vec3(0.04, 0.3, 0.4), blend);
    vec3 color = toLinear(mix(darkColor, lightColor, uLight));
    float band = exp(-pow((blend - 0.5) * 6.0, 2.0)) * (0.5 + 0.5 * sin(uTime * 0.4 + point.x * 0.08));
    color += toLinear(mix(vec3(0.5, 0.4, 1.0), vec3(1.0, 1.0, 1.0), uLight)) * band * mix(0.12, 0.18, uLight);
    float activeBoost = clamp(uActive * (viewerHalf * 2.0 - 1.0), 0.0, 1.0);
    float divider = exp(-abs(point.y) * 8.0) * (0.5 + 0.5 * sin(uTime * 1.4 + point.x * 0.5));
    vec4 ripple = getArenaRipple(point);
    color += sideColor * (activeBoost * 0.05 + divider * mix(0.12, 0.08, uLight));
    color += ripple.rgb * mix(1.0, 0.45, uLight);
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

export function ArenaAuroraFloor({ colors, ripples, activeSide }: Props) {
  return (
    <ArenaShaderFloor fragmentShader={FRAGMENT_SHADER} colors={colors} ripples={ripples} activeSide={activeSide} />
  );
}
