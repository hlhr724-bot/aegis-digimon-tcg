import { AdditiveBlending, Color, ShaderMaterial, Vector2 } from "three";
import { ARENA_NOISE_GLSL } from "@/game/arena3d/arenaNoiseGlsl";

const VERTEX_SHADER = `
  varying vec2 vPoint;
  varying vec4 vClip;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPoint = world.xz;
    vClip = projectionMatrix * viewMatrix * world;
    gl_Position = vClip;
  }
`;

const FRAGMENT_SHADER = `
  ${ARENA_NOISE_GLSL}
  uniform float uTime;
  uniform float uFlow;
  uniform float uEnergy;
  uniform float uLight;
  uniform float uFacing;
  uniform float uWeight;
  uniform float uHarmful;
  uniform vec3 uColor;
  uniform float uArrival;
  uniform float uArrivalProgress;
  uniform float uArrivalHarmful;
  uniform vec3 uArrivalColor;
  uniform vec2 uHalfSize;
  uniform float uCenterDepth;
  uniform vec2 uScreenFade;
  varying vec2 vPoint;
  varying vec4 vClip;
  const float FRAME_CORNER = 0.4;
  const float RIM_WIDTH = 0.05;
  const float HALO_WIDTH = 0.5;
  const float RING_WIDTH = 0.22;
  const float RING_OUTSIDE = 0.9;
  const float HEARTBEAT_SECONDS = 2.4;
  const float COMET_SPEED = 0.7;

  float getRoundedBoxDistance(vec2 local, vec2 halfSize, float corner) {
    vec2 edge = abs(local) - (halfSize - corner);
    return length(max(edge, 0.0)) + min(max(edge.x, edge.y), 0.0) - corner;
  }

  float getScreenFade() {
    vec2 screen = abs(vClip.xy / vClip.w);
    vec2 fade = 1.0 - smoothstep(vec2(1.0) - uScreenFade, vec2(1.0), screen);
    return fade.x * fade.y;
  }

  float sharpen(float value) {
    value *= value;
    value *= value;
    value *= value;
    return value * value;
  }

  float getComets(vec2 local, float time) {
    float angle = atan(local.y / uHalfSize.y, local.x / uHalfSize.x);
    float lead = sharpen(0.5 + 0.5 * cos(angle - time * COMET_SPEED));
    float trail = sharpen(0.5 + 0.5 * cos(angle + 3.14159 - time * COMET_SPEED));
    return lead + trail;
  }

  float getHeartbeat(float time) {
    float phase = fract(time / HEARTBEAT_SECONDS);
    float first = (phase - 0.08) / 0.045;
    float second = (phase - 0.25) / 0.06;
    return exp(-first * first) + exp(-second * second) * 0.6;
  }

  float getRipple(float inside, float time) {
    float speed = mix(1.2, -0.9, uHarmful);
    float wave = 0.5 + 0.5 * sin(inside * 2.6 + time * speed);
    wave *= wave;
    wave *= wave;
    return wave * exp(-inside * 0.8) * smoothstep(0.0, 0.25, inside);
  }

  float getSmoke(vec2 local, float time) {
    if (uEnergy > 0.0) {
      return fbm(local * 0.75 + vec2(time * 0.06, -time * 0.1));
    }
    return 0.5 + 0.25 * sin(local.x * 1.3 + time * 0.3) * sin(local.y * 1.7 - time * 0.25);
  }

  float getArrivalRing(float frameDistance) {
    if (uArrival <= 0.0) {
      return 0.0;
    }
    float centerDistance = -min(uHalfSize.x, uHalfSize.y);
    float start = mix(centerDistance, RING_OUTSIDE, uArrivalHarmful);
    float end = mix(RING_OUTSIDE * 0.6, centerDistance * 0.55, uArrivalHarmful);
    float behind = (frameDistance - mix(start, end, uArrivalProgress)) / RING_WIDTH;
    return exp(-behind * behind) * uArrival;
  }

  void main() {
    float depth = vPoint.y * uFacing;
    vec2 local = vec2(vPoint.x, depth - uCenterDepth);
    float frameDistance = getRoundedBoxDistance(local, uHalfSize, FRAME_CORNER);
    float envelope = getScreenFade() * smoothstep(0.0, 0.35, depth);
    float time = uTime * uFlow;
    float inside = max(-frameDistance, 0.0);
    float interior = 1.0 - smoothstep(-0.2, 0.12, frameDistance);
    float rim = exp(-(frameDistance * frameDistance) / (RIM_WIDTH * RIM_WIDTH));
    float halo = exp(-(frameDistance * frameDistance) / (HALO_WIDTH * HALO_WIDTH));
    float smoke = mix(1.0, mix(0.5, 1.4, getSmoke(local, time)), uHarmful);
    float ripple = getRipple(inside, time) * uFlow;
    float comets = getComets(local, time) * uFlow * (1.0 - uHarmful);
    float heartbeat = getHeartbeat(time) * uFlow * uHarmful;
    float pulse = 0.55 + comets * 0.9 + heartbeat * 0.75;
    float fill = interior * (0.13 + ripple * 0.2) * smoke * uWeight * envelope;
    float line = (rim + halo * 0.28) * pulse * uWeight * envelope;
    float burst = (getArrivalRing(frameDistance) + uArrival * (interior * 0.2 + rim * 0.8)) * envelope;
    float total = fill + line + burst;
    if (total <= 0.002) {
      discard;
    }
    vec3 fillColor = mix(uColor, uColor * mix(0.22, 0.8, uLight), uHarmful);
    vec3 lineColor = mix(mix(uColor, vec3(1.0), mix(0.35, 0.1, uHarmful)), uColor, uLight);
    vec3 burstColor = mix(mix(uArrivalColor, vec3(1.0), 0.45), uArrivalColor, uLight);
    vec3 sum = fillColor * fill + lineColor * line + burstColor * burst;
    float fillAlpha = mix(1.4, mix(2.6, 1.6, uLight), uHarmful);
    vec4 additive = vec4(sum, 1.0);
    vec4 layered = vec4(sum / total, clamp(fill * fillAlpha + line * 1.5 + burst, 0.0, 0.9));
    gl_FragColor = mix(additive, layered, max(uLight, uHarmful));
    #include <colorspace_fragment>
  }
`;

export function buildFieldEffectAuraMaterial(facing: number): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uFlow: { value: 1 },
      uEnergy: { value: 1 },
      uLight: { value: 0 },
      uFacing: { value: facing },
      uWeight: { value: 0 },
      uHarmful: { value: 0 },
      uColor: { value: new Color() },
      uArrival: { value: 0 },
      uArrivalProgress: { value: 0 },
      uArrivalHarmful: { value: 0 },
      uArrivalColor: { value: new Color() },
      uHalfSize: { value: new Vector2(1, 1) },
      uCenterDepth: { value: 0 },
      uScreenFade: { value: new Vector2(0.12, 0.1) },
    },
  });
}
