import { AdditiveBlending, Color, ShaderMaterial, Vector4 } from "three";

const VERTEX_SHADER = `
  attribute vec4 aTile;
  varying vec2 vUv;
  varying vec4 vTile;
  void main() {
    vUv = uv;
    vTile = aTile;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform vec3 uViewerColor;
  uniform vec3 uOpponentColor;
  uniform vec3 uViewerEffectColor;
  uniform vec3 uOpponentEffectColor;
  uniform vec3 uDropColor;
  uniform vec4 uViewerState;
  uniform vec4 uOpponentState;
  uniform float uTime;
  uniform float uLight;
  varying vec2 vUv;
  varying vec4 vTile;

  void main() {
    vec2 size = vTile.xy;
    vec2 point = (vUv - 0.5) * size;
    float radius = min(size.x, size.y) * 0.1;
    vec2 corner = abs(point) - (size * 0.5 - radius);
    float edge = length(max(corner, 0.0)) + min(max(corner.x, corner.y), 0.0) - radius;
    float smoothing = max(fwidth(edge), 0.003);
    float inside = 1.0 - smoothstep(-smoothing, smoothing, edge);
    if (inside <= 0.0) {
      discard;
    }
    bool viewer = vTile.w > 0.0;
    vec4 state = viewer ? uViewerState : uOpponentState;
    vec3 sideColor = viewer ? uViewerColor : uOpponentColor;
    vec3 effectColor = viewer ? uViewerEffectColor : uOpponentEffectColor;
    float lit = step(0.5, vTile.z);
    float droppable = 1.0 - step(1.5, vTile.z);
    float occupied = lit * droppable;
    float lineWidth = 0.028;
    float line = 1.0 - smoothstep(lineWidth, lineWidth + smoothing * 1.5, abs(edge + lineWidth));
    float rim = smoothstep(-0.32, 0.0, edge);
    float effectPulse = state.y * (0.8 + 0.2 * sin(uTime * 1.1));
    float drop = state.x * droppable * (1.0 - occupied * 0.6);
    float breathe = 0.5 + 0.5 * sin(uTime * 3.2);
    vec3 color = mix(sideColor, vec3(0.42, 0.88, 1.0), 0.6);
    color = mix(color, effectColor, state.y * 0.7);
    color = mix(color, uDropColor, drop * 0.8);
    float fill = mix(0.035, 0.06, lit) + rim * 0.05 + state.z * 0.02 + effectPulse * 0.05;
    fill += drop * (0.14 + 0.08 * breathe);
    float lineAlpha = mix(0.2, 0.3, lit) + effectPulse * 0.18 + drop * 0.5;
    float alpha = clamp(fill + line * lineAlpha, 0.0, 1.0) * inside;
    color = mix(color, color * 0.62, uLight);
    alpha *= mix(1.0, 1.35, uLight);
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

export function buildArenaSlotTileMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: AdditiveBlending,
    uniforms: {
      uViewerColor: { value: new Color() },
      uOpponentColor: { value: new Color() },
      uViewerEffectColor: { value: new Color() },
      uOpponentEffectColor: { value: new Color() },
      uDropColor: { value: new Color("#6ff5cf") },
      uViewerState: { value: new Vector4() },
      uOpponentState: { value: new Vector4() },
      uTime: { value: 0 },
      uLight: { value: 0 },
    },
  });
}
