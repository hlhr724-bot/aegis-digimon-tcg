import { Color, ShaderMaterial, Vector4 } from "three";

const VERTEX_SHADER = `
  varying vec2 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT_SHADER = `
  uniform vec4 uEggs;
  uniform vec4 uRaising;
  uniform float uStrength;
  uniform float uLevel;
  uniform float uSocket;
  uniform float uFeather;
  uniform float uRadius;
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uRim;
  varying vec2 vWorld;

  float measureRoundedBox(vec2 point, vec4 box) {
    vec2 corner = abs(point - box.xy) - box.zw + uRadius;
    return length(max(corner, 0.0)) + min(max(corner.x, corner.y), 0.0) - uRadius;
  }

  float traceSweep(vec2 point, vec4 box) {
    vec2 offset = (point - box.xy) / box.zw;
    float angle = atan(offset.y, offset.x);
    return pow(0.5 + 0.5 * cos(angle - uTime * 1.4), 10.0);
  }

  void main() {
    vec2 low = min(uEggs.xy - uEggs.zw, uRaising.xy - uRaising.zw);
    vec2 high = max(uEggs.xy + uEggs.zw, uRaising.xy + uRaising.zw);
    vec4 area = vec4((low + high) * 0.5, (high - low) * 0.5);
    float gap = measureRoundedBox(vWorld, area);
    float shade = smoothstep(0.0, uFeather, gap);
    float dim = shade * uStrength;

    float sweep = traceSweep(vWorld, area);
    float line = exp(-abs(gap - 0.035) / 0.022);
    float halo = exp(-max(gap, 0.0) / 0.22) * step(0.0, gap) * 0.32;
    float rim = clamp((line * (0.55 + 0.45 * sweep) + halo * (0.6 + 0.4 * sweep)) * uLevel, 0.0, 1.0);

    float socket = abs(measureRoundedBox(vWorld, uRaising - vec4(0.0, 0.0, 0.07, 0.07)));
    rim = max(rim, exp(-socket / 0.014) * 0.6 * uLevel * uSocket);

    float alpha = max(dim, rim);
    if (alpha < 0.003) {
      discard;
    }
    vec3 color = mix(uColor, uRim, rim / alpha);
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

export function buildArenaBreedingFocusMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uEggs: { value: new Vector4() },
      uRaising: { value: new Vector4() },
      uStrength: { value: 0 },
      uLevel: { value: 0 },
      uSocket: { value: 1 },
      uFeather: { value: 0.05 },
      uRadius: { value: 0.18 },
      uTime: { value: 0 },
      uColor: { value: new Color("#040912") },
      uRim: { value: new Color("#7fd4ff") },
    },
  });
}
