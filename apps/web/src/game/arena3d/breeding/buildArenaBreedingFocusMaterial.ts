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
  uniform float uFeather;
  uniform float uRadius;
  uniform float uBlend;
  uniform vec3 uColor;
  varying vec2 vWorld;

  float measureRoundedBox(vec2 point, vec4 box) {
    vec2 corner = abs(point - box.xy) - box.zw + uRadius;
    return length(max(corner, 0.0)) + min(max(corner.x, corner.y), 0.0) - uRadius;
  }

  float blendMinimum(float first, float second, float softness) {
    float weight = clamp(0.5 + 0.5 * (second - first) / softness, 0.0, 1.0);
    return mix(second, first, weight) - softness * weight * (1.0 - weight);
  }

  void main() {
    float gap = blendMinimum(measureRoundedBox(vWorld, uEggs), measureRoundedBox(vWorld, uRaising), uBlend);
    float shade = smoothstep(0.0, uFeather, gap);
    float alpha = shade * shade * (3.0 - 2.0 * shade) * uStrength;
    if (alpha < 0.003) {
      discard;
    }
    gl_FragColor = vec4(uColor, alpha);
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
      uFeather: { value: 0.8 },
      uRadius: { value: 0.3 },
      uBlend: { value: 0.5 },
      uColor: { value: new Color("#040912") },
    },
  });
}
