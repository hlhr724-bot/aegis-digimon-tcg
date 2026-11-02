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
    float drift = 0.5 + 0.5 * sin(uTime * 0.12 + point.x * 0.05);
    float blend = smoothstep(-22.0, 10.0, point.y + point.x * 0.35 + drift * 4.0);
    float glow = exp(-length(point * vec2(0.08, 0.12)));
    vec3 lightColor = mix(mix(vec3(0.79, 0.73, 1.0), vec3(1.0, 0.82, 0.74), blend), vec3(1.0, 0.98, 0.96), glow * 0.55);
    vec3 darkColor = mix(mix(vec3(0.1, 0.08, 0.24), vec3(0.04, 0.17, 0.22), blend), vec3(0.2, 0.17, 0.36), glow * 0.6);
    vec3 color = toLinear(mix(darkColor, lightColor, uLight));
    color *= 0.97 + 0.06 * valueNoise(point * 6.0);
    float activeBoost = clamp(uActive * (viewerHalf * 2.0 - 1.0), 0.0, 1.0);
    float divider = exp(-abs(point.y) * 8.0) * (0.5 + 0.5 * sin(uTime * 1.5 + point.x * 0.6));
    vec4 ripple = getArenaRipple(point);
    color += sideColor * (activeBoost * 0.06 * glow + divider * mix(0.12, 0.08, uLight));
    color += ripple.rgb * mix(1.0, 0.45, uLight);
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

export function ArenaPrismFloor({ colors, ripples, activeSide }: Props) {
  return (
    <ArenaShaderFloor fragmentShader={FRAGMENT_SHADER} colors={colors} ripples={ripples} activeSide={activeSide} />
  );
}
