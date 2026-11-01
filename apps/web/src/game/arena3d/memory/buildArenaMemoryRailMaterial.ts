import { Color, ShaderMaterial, Vector2 } from "three";
import { ARENA_MEMORY_TRACK } from "@/game/arena3d/field/arenaWorldLayout";

const VERTEX_SHADER = `
  uniform vec2 uHalfSize;
  uniform float uHeight;
  varying vec2 vLocal;
  void main() {
    vLocal = position.xy * 2.0 * uHalfSize;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(vLocal.x, uHeight, -vLocal.y, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform vec2 uHalfSize;
  uniform vec3 uPlayer;
  uniform vec3 uOpponent;
  uniform vec3 uBase;
  uniform float uOpacity;
  varying vec2 vLocal;
  void main() {
    vec2 inner = vec2(uHalfSize.x - uHalfSize.y, 0.0);
    vec2 offset = max(abs(vLocal) - inner, 0.0);
    float dist = length(offset) - uHalfSize.y;
    float edgeWidth = fwidth(dist) * 1.25;
    float body = 1.0 - smoothstep(-edgeWidth, edgeWidth, dist);
    float border = 1.0 - smoothstep(0.0, 0.03, abs(dist + 0.02));
    if (body + border < 0.002) {
      discard;
    }
    float towardViewer = smoothstep(0.6, -0.6, vLocal.x);
    vec3 side = mix(uOpponent, uPlayer, towardViewer);
    vec3 color = mix(uBase, side, 0.12) + side * border * 0.9;
    gl_FragColor = vec4(color, max(body * uOpacity, border * 0.85));
    #include <colorspace_fragment>
  }
`;

export function buildArenaMemoryRailMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uHalfSize: {
        value: new Vector2(
          ARENA_MEMORY_TRACK.coinSpacing * 10.5 + ARENA_MEMORY_TRACK.railHalfDepth * 0.2,
          ARENA_MEMORY_TRACK.railHalfDepth,
        ),
      },
      uHeight: { value: ARENA_MEMORY_TRACK.height * 0.5 },
      uPlayer: { value: new Color() },
      uOpponent: { value: new Color() },
      uBase: { value: new Color("#0b1122") },
      uOpacity: { value: 0.78 },
    },
  });
}
