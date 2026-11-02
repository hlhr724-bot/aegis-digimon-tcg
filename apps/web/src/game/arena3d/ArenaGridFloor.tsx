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

  float hexEdge(vec2 point, float scale) {
    point *= scale;
    vec2 ratio = vec2(1.0, 1.7320508);
    vec2 half_ = ratio * 0.5;
    vec2 a = mod(point, ratio) - half_;
    vec2 b = mod(point - half_, ratio) - half_;
    vec2 cell = dot(a, a) < dot(b, b) ? a : b;
    vec2 q = abs(cell);
    float distanceToCenter = max(dot(q, normalize(ratio)), q.x);
    float edge = 0.5 - distanceToCenter;
    float width = fwidth(distanceToCenter) * 1.5;
    return 1.0 - smoothstep(0.0, 0.035 + width, edge);
  }

  void main() {
    vec2 point = vWorld.xz;
    float viewerHalf = smoothstep(-0.8, 0.8, point.y);
    vec3 sideColor = mix(uOpponent, uPlayer, viewerHalf);
    float radius = length(point * vec2(0.8, 1.0));
    float fade = 1.0 - smoothstep(5.0, 24.0, radius);
    float hex = hexEdge(point, 0.85);
    float breathing = 0.16 + 0.1 * sin(uTime * 0.9 - radius * 0.55);
    float activeBoost = 1.0 + 1.1 * clamp(uActive * (viewerHalf * 2.0 - 1.0), 0.0, 1.0);
    float grid = hex * breathing * activeBoost;
    float divider = exp(-abs(point.y) * 7.0) * (0.55 + 0.45 * sin(uTime * 2.4 + point.x * 0.9));
    vec4 ripple = getArenaRipple(point);
    vec3 light = ripple.rgb;
    grid += hex * ripple.a * 2.2;

    vec3 color;
    if (uLight > 0.5) {
      vec3 ink = sideColor * 0.6;
      color = mix(uSurface, ink, clamp((grid * 2.6 + divider * 0.6) * fade, 0.0, 0.9));
      color *= 0.9 + 0.1 * fade;
      color += light * 0.45 * fade;
    } else {
      vec3 floorTone = uSurface * (0.55 + 0.45 * fade) + sideColor * 0.025 * fade;
      color = floorTone + (sideColor * (grid * 1.05 + divider * 0.7) + light) * fade;
    }
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function ArenaGridFloor({ colors, ripples, activeSide }: Props) {
  return (
    <ArenaShaderFloor fragmentShader={FRAGMENT_SHADER} colors={colors} ripples={ripples} activeSide={activeSide} />
  );
}
