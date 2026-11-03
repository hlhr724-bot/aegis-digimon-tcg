import { AdditiveBlending, ShaderMaterial } from "three";

const VERTEX_SHADER = `
  attribute vec3 aColor;
  attribute float aProgress;
  attribute float aStrength;
  attribute float aKind;
  varying vec2 vPoint;
  varying vec3 vColor;
  varying float vProgress;
  varying float vStrength;
  varying float vKind;
  void main() {
    vPoint = uv * 2.0 - 1.0;
    vColor = aColor;
    vProgress = aProgress;
    vStrength = aStrength;
    vKind = aKind;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform float uTime;
  uniform float uLight;
  varying vec2 vPoint;
  varying vec3 vColor;
  varying float vProgress;
  varying float vStrength;
  varying float vKind;

  float hashCell(vec2 cell) {
    return fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
  }

  float getCardDistance(vec2 point, float grow) {
    vec2 halfSize = vec2(0.4167, 0.582) + grow;
    vec2 inner = abs(point) - (halfSize - 0.07);
    return length(max(inner, 0.0)) + min(max(inner.x, inner.y), 0.0) - 0.07;
  }

  float getLine(float distance, float center, float width) {
    float offset = (distance - center) / width;
    return exp(-offset * offset);
  }

  void main() {
    float angle = atan(vPoint.y, vPoint.x);
    float distance = getCardDistance(vPoint, 0.0);
    float outside = max(distance, 0.0);
    vec3 color = vColor;
    float alpha = 0.0;
    if (vKind < 0.5) {
      float runner = pow(0.5 + 0.5 * sin(angle * 2.0 - uTime * 1.4), 10.0);
      float halo = exp(-outside * 11.0) * step(0.0, distance);
      float edge = getLine(distance, 0.035, 0.018);
      alpha = (halo * 0.38 + edge * (0.3 + 0.7 * runner)) * vStrength;
      color = mix(vColor, vec3(1.0), runner * edge * 0.35);
    } else if (vKind < 1.5) {
      float grow = 1.0 - pow(1.0 - vProgress, 3.0);
      float fade = pow(1.0 - vProgress, 1.5);
      alpha = (getLine(distance, mix(0.03, 0.24, grow), 0.035) + exp(-outside * 9.0) * step(0.0, distance) * 0.3) * fade;
    } else if (vKind > 2.5) {
      float breath = 0.82 + 0.18 * sin(uTime * 1.6);
      float ring = getLine(distance, 0.05, 0.016);
      float glow = exp(-outside * 14.0) * step(0.0, distance);
      float stars = pow(0.5 + 0.5 * cos(angle * 3.0 - uTime * 1.5), 28.0);
      float twinkle = getLine(distance, 0.05, 0.03) * stars;
      alpha = (ring * 0.55 * breath + glow * 0.2 * breath + twinkle * 0.95) * vStrength;
      color = mix(vColor, vec3(1.0), twinkle * 0.45);
    } else {
      float settle = 1.0 - pow(1.0 - vProgress, 3.0);
      float reach = mix(0.42, 0.03, settle);
      float window = getLine(distance, reach, 0.09);
      float arms = pow(0.5 + 0.5 * sin(angle * 3.0 + distance * 22.0 - vProgress * 8.0), 6.0);
      vec2 sparkCell = floor(vec2(angle * 9.0, distance * 30.0 + vProgress * 5.0));
      float sparks = step(0.9, hashCell(sparkCell)) * (0.6 + 0.4 * sin(uTime * 20.0 + sparkCell.x));
      alpha = (arms * 0.7 + sparks * 0.55) * window * sin(vProgress * 3.14159265);
      color = mix(vColor, vec3(1.0), 0.3);
    }
    if (alpha < 0.003) {
      discard;
    }
    gl_FragColor = vec4(color * mix(1.6, 1.0, uLight), clamp(alpha, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

export function buildArenaCueDecalMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uLight: { value: 0 },
    },
  });
}
