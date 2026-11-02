export const FOIL_SHADER_CHUNK = `
  float foilHash(vec2 point) {
    return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
  }

  vec3 foilSpectrum(float phase) {
    return 0.5 + 0.5 * cos(6.28318 * (phase + vec3(0.0, 0.33, 0.67)));
  }

  vec3 foilHexCell(vec2 point) {
    vec2 ratio = vec2(1.0, 1.7320508);
    vec2 halfRatio = ratio * 0.5;
    vec2 first = mod(point, ratio) - halfRatio;
    vec2 second = mod(point - halfRatio, ratio) - halfRatio;
    vec2 local = dot(first, first) < dot(second, second) ? first : second;
    vec2 folded = abs(local);
    float distanceToCenter = max(dot(folded, vec2(0.5, 0.8660254)), folded.x);
    return vec3(point - local, 0.5 - distanceToCenter);
  }

  float foilSparkle(vec2 point, float scale, float seed, float phase) {
    vec2 grid = point * scale;
    vec2 cell = floor(grid);
    vec2 local = fract(grid) - 0.5;
    float random = foilHash(cell + seed);
    vec2 offset = (vec2(foilHash(cell + seed + 1.7), foilHash(cell + seed + 4.3)) - 0.5) * 0.5;
    vec2 delta = local - offset;
    float twinkle = smoothstep(0.6, 1.0, 0.5 + 0.5 * sin(random * 47.0 + phase * (1.0 + random * 1.2)));
    float glow = exp(-dot(delta, delta) * 70.0);
    float horizontal = exp(-abs(delta.y) * 70.0) * exp(-abs(delta.x) * 7.0);
    float vertical = exp(-abs(delta.x) * 70.0) * exp(-abs(delta.y) * 7.0);
    return (glow + (horizontal + vertical) * 0.45) * twinkle * step(0.7, random);
  }
`;
