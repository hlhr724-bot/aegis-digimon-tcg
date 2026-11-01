import { AdditiveBlending, DoubleSide, ShaderMaterial } from "three";

const VERTEX_SHADER = `
  attribute vec3 aColor;
  attribute float aStrength;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vStrength;
  void main() {
    vUv = uv;
    vColor = aColor;
    vStrength = aStrength;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform float uTime;
  uniform float uLight;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vStrength;
  void main() {
    float fade = pow(1.0 - vUv.y, 2.2);
    float drift = 0.7 + 0.3 * sin(vUv.y * 14.0 - uTime * 1.6);
    float streaks = 0.75 + 0.25 * sin(vUv.x * 6.2831853 * 5.0 + uTime * 0.5);
    float alpha = fade * drift * streaks * vStrength * 0.42;
    if (alpha < 0.003) {
      discard;
    }
    gl_FragColor = vec4(vColor * mix(1.8, 1.0, uLight), clamp(alpha, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

export function buildArenaCueColumnMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uLight: { value: 0 },
    },
  });
}
