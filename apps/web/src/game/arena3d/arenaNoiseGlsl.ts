export const ARENA_NOISE_GLSL = `
  float hash21(vec2 point) {
    point = fract(point * vec2(123.34, 456.21));
    point += dot(point, point + 45.32);
    return fract(point.x * point.y);
  }

  float valueNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    vec2 blend = local * local * (3.0 - 2.0 * local);
    float a = hash21(cell);
    float b = hash21(cell + vec2(1.0, 0.0));
    float c = hash21(cell + vec2(0.0, 1.0));
    float d = hash21(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
  }

  float fbm(vec2 point) {
    float total = 0.0;
    float amplitude = 0.5;
    for (int octave = 0; octave < 3; octave++) {
      total += valueNoise(point) * amplitude;
      point = point * 2.03 + 17.1;
      amplitude *= 0.5;
    }
    return total;
  }
`;
