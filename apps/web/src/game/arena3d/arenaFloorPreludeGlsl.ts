import { ARENA_NOISE_GLSL } from "@/game/arena3d/arenaNoiseGlsl";
import { ARENA_RIPPLE_GLSL } from "@/game/arena3d/arenaRippleGlsl";

export const ARENA_FLOOR_PRELUDE_GLSL = `
  uniform float uActive;
  uniform float uLight;
  uniform vec3 uSurface;
  uniform vec3 uPlayer;
  uniform vec3 uOpponent;
  varying vec3 vWorld;
  ${ARENA_RIPPLE_GLSL}
  ${ARENA_NOISE_GLSL}

  vec3 toLinear(vec3 color) {
    return pow(color, vec3(2.2));
  }
`;
