import { RIPPLE_LIFETIME_SECONDS, RIPPLE_SLOTS, SWEEP_SECONDS } from "@/game/arena3d/arenaSceneLayout";

export const ARENA_RIPPLE_GLSL = `
  #define RIPPLE_SLOTS ${RIPPLE_SLOTS}
  uniform float uTime;
  uniform vec4 uRipples[RIPPLE_SLOTS];
  uniform vec3 uRippleColors[RIPPLE_SLOTS];
  uniform float uSweepStart;
  uniform float uSweepDirection;
  uniform vec3 uSweepColor;

  vec4 getArenaRipple(vec2 point) {
    vec3 light = vec3(0.0);
    float wave = 0.0;
    for (int index = 0; index < RIPPLE_SLOTS; index++) {
      vec4 ripple = uRipples[index];
      float age = uTime - ripple.z;
      if (ripple.w > 0.0 && age >= 0.0 && age < ${RIPPLE_LIFETIME_SECONDS.toFixed(1)}) {
        float life = 1.0 - age / ${RIPPLE_LIFETIME_SECONDS.toFixed(1)};
        float front = age * 7.5;
        float gap = abs(length(point - ripple.xy) - front);
        float ring = exp(-gap * gap * 2.5) * life * ripple.w;
        float core = exp(-length(point - ripple.xy) * 1.2) * life * life * ripple.w;
        light += uRippleColors[index] * (ring + core * 0.8);
        wave += ring;
      }
    }
    float sweepAge = uTime - uSweepStart;
    if (sweepAge >= 0.0 && sweepAge < ${SWEEP_SECONDS.toFixed(1)}) {
      float progress = sweepAge / ${SWEEP_SECONDS.toFixed(1)};
      float front = mix(-16.0, 16.0, progress) * uSweepDirection;
      float gap = abs(point.y - front);
      float band = exp(-gap * gap * 0.6) * (1.0 - progress);
      light += uSweepColor * band * 1.4;
      wave += band * 1.15;
    }
    return vec4(light, wave);
  }
`;
