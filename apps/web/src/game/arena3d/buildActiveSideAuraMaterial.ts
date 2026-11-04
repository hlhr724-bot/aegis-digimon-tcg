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
  uniform float uSweepStart;
  uniform float uActive;
  uniform float uFlow;
  uniform float uEnergy;
  uniform float uLight;
  uniform float uFacing;
  uniform float uWeight;
  uniform float uSurge;
  uniform float uSurgeStart;
  uniform vec3 uColor;
  uniform vec3 uAccent;
  uniform vec3 uSurface;
  uniform vec2 uHalfSize;
  uniform vec2 uBounds;
  uniform float uCenterDepth;
  uniform float uStrength;
  uniform float uCenterFade;
  uniform float uBoundsFade;
  uniform vec2 uScreenFade;
  uniform float uWash;
  varying vec2 vPoint;
  varying vec4 vClip;
  const float AURA_CORNER = 2.4;
  const float AURA_FALLOFF = 2.0;
  const float BOUNDS_CORNER = 1.8;
  const float SWEEP_SPEED = 6.5;
  const float SWEEP_SOFT = 1.8;
  const float SWEEP_WIDTH = 0.5;
  const float CREST_PERIOD = 5.2;
  const float CREST_SPEED = 1.6;
  const float CREST_WIDTH = 0.2;
  const float CREST_GLOW = 0.8;
  const float SURGE_SPEED = 8.0;
  const float SURGE_WIDTH = 0.35;
  const float SCAN_PITCH = 0.3;
  const float DETAIL_THRESHOLD = 0.03;

  float getRoundedBoxDistance(vec2 local, vec2 halfSize, float corner) {
    vec2 edge = abs(local) - (halfSize - corner);
    return length(max(edge, 0.0)) + min(max(edge.x, edge.y), 0.0) - corner;
  }

  float getScreenFade() {
    vec2 screen = abs(vClip.xy / vClip.w);
    vec2 fade = 1.0 - smoothstep(vec2(1.0) - uScreenFade, vec2(1.0), screen);
    return fade.x * fade.y;
  }

  float getWarp(vec2 point, float time) {
    float swell = sin(point.x * 0.5 + time * 0.4) * 0.3;
    if (uEnergy > 0.0) {
      return swell + (valueNoise(vec2(point.x * 0.16 + time * 0.05, point.y * 0.16 - time * 0.07)) - 0.5) * 1.2;
    }
    return swell + sin(point.x * 0.23 + point.y * 0.3 - time * 0.27) * 0.25;
  }

  float getEnvelope(vec2 point, float depth, float warp) {
    float region = getRoundedBoxDistance(vec2(point.x, depth - uCenterDepth), uHalfSize, AURA_CORNER) - warp * 0.6;
    float spread = max(region, 0.0) / AURA_FALLOFF;
    float body = exp(-spread * spread);
    float bounds = getRoundedBoxDistance(point, uBounds, BOUNDS_CORNER);
    float boundsFade = smoothstep(0.0, uBoundsFade, -bounds);
    float centerFade = smoothstep(0.0, uCenterFade, depth);
    float shore = mix(0.72, 1.0, smoothstep(0.0, uBounds.y, depth));
    return body * boundsFade * centerFade * shore * getScreenFade();
  }

  float getSwellCrest(float phase) {
    float swell = 0.5 + 0.5 * sin(phase);
    return swell * swell * swell;
  }

  float getSwells(float inward, float across, float warp, float time) {
    float broad = getSwellCrest((inward + warp) * 1.35 - time * 1.2 + across * 0.07);
    float ripple = getSwellCrest((inward + warp * 0.6) * 2.3 - time * 1.8 - across * 0.11);
    float tide = getSwellCrest((inward - warp * 0.4) * 0.7 - time * 0.5);
    return broad * 0.34 + ripple * 0.14 + tide * 0.2;
  }

  float getShimmer(vec2 point, float inward, float swells, float time) {
    vec2 bent = vec2(point.x, inward) + swells * 1.4;
    float first = sin(bent.x * 1.9 + bent.y * 1.2 + time * 0.6);
    float second = sin(bent.y * 2.2 - bent.x * 1.5 - time * 0.75);
    float caustic = 1.0 - abs(first + second) * 0.5;
    caustic *= caustic;
    caustic *= caustic;
    return caustic * caustic;
  }

  float getScanlines(float inward, float time, float density) {
    float coordinate = inward / SCAN_PITCH - time * 0.25;
    float line = 1.0 - abs(fract(coordinate) - 0.5) * 2.0;
    return line * line * (1.0 - smoothstep(0.18, 0.45, density));
  }

  float getLine(float behind, float width) {
    return exp(-(behind * behind) / (width * width));
  }

  vec2 getCrest(float inward, float time) {
    float cycle = mod(max(time - uSweepStart, 0.0), CREST_PERIOD);
    float front = cycle * CREST_SPEED - 0.6;
    float behind = front - inward;
    float reach = uBounds.y;
    float life = smoothstep(0.0, 0.8, cycle) * (1.0 - smoothstep(reach * 0.5, reach, front));
    if (life <= 0.0) {
      return vec2(0.0);
    }
    float line = getLine(behind, CREST_WIDTH);
    float glow = getLine(behind, CREST_GLOW) * 0.3;
    float wake = smoothstep(-0.2, 0.5, behind) * exp(-max(behind, 0.0) / 1.3) * 0.16;
    return vec2(line * 0.75, glow + wake) * life;
  }

  vec2 getSweep(float inward, float time) {
    float front = uFlow > 0.0 ? (time - uSweepStart) * SWEEP_SPEED - 0.6 : 1000.0;
    float covered = 1.0 - smoothstep(front - SWEEP_SOFT, front, inward);
    float mask = mix(1.0 - covered, covered, uActive);
    float edgeLife = 1.0 - smoothstep(uBounds.y * 0.6, uBounds.y + 1.0, front);
    if (edgeLife <= 0.0) {
      return vec2(mask, 0.0);
    }
    return vec2(mask, getLine(front - SWEEP_SOFT * 0.5 - inward, SWEEP_WIDTH) * edgeLife * 0.55);
  }

  vec2 getSurge(float inward, float swells) {
    if (uSurge <= 0.0) {
      return vec2(0.0);
    }
    float behind = (uTime - uSurgeStart) * SURGE_SPEED - 0.5 - inward;
    float lines = (getLine(behind, SURGE_WIDTH) + getLine(behind - 1.8, SURGE_WIDTH * 1.6) * 0.5) * uFlow;
    return uSurge * vec2(lines * 1.3, 0.45 + swells * 1.4);
  }

  float getWashEnvelope(vec2 point) {
    float across = smoothstep(0.0, uBoundsFade, uBounds.x - abs(point.x));
    return across * getScreenFade() * uWeight;
  }

  float getSparkField(vec2 point, float inward, float time) {
    const float CELL = 0.7;
    vec2 flow = vec2(point.x, inward - time * 0.45);
    vec2 cell = floor(flow / CELL);
    float pick = hash21(cell + 3.7);
    if (pick < 0.4) {
      return 0.0;
    }
    vec2 jitter = vec2(hash21(cell + 11.3), hash21(cell + 27.1)) - 0.5;
    vec2 local = (fract(flow / CELL) - 0.5 - jitter * 0.6) * CELL;
    float radius = length(local);
    float twinkle = 0.5 + 0.5 * sin(time * 3.0 + pick * 40.0);
    float life = sin(3.14159 * fract(time * 0.3 + hash21(cell + 5.9)));
    float core = exp(-(radius * radius) / 0.0012);
    float halo = exp(-(radius * radius) / 0.012) * 0.35;
    return (core + halo) * life * (0.55 + 0.45 * twinkle);
  }

  vec2 getWash(vec2 point, float depth) {
    float time = uTime * uFlow;
    float envelope = getWashEnvelope(point);
    if (envelope <= 0.002) {
      return vec2(0.0);
    }
    float toward = clamp(depth / uBounds.y, 0.0, 1.0);
    float inward = uBounds.y - depth;
    vec2 sweep = getSweep(inward, uTime);
    vec2 core = vec2(point.x / (uHalfSize.x * 1.05), (depth - uCenterDepth) / (uHalfSize.y * 1.25));
    float pool = exp(-dot(core, core) * 1.1);
    float rise = smoothstep(0.0, 0.25, depth / uBounds.y);
    float fill = (pool * 0.75 + smoothstep(0.2, 1.0, toward) * 0.15) * rise;
    float sparks = 0.0;
    if (uFlow > 0.0) {
      sparks = getSparkField(point, inward, time) * (0.6 + pool * 0.4) * rise * 1.6;
    }
    vec2 surge = getSurge(inward, pool);
    return vec2((fill + surge.y * 0.4) * sweep.x, (sparks + surge.x) * sweep.x + sweep.y) * envelope;
  }

  vec3 getMutedColor(vec3 color) {
    vec3 grey = vec3(dot(color, vec3(0.2126, 0.7152, 0.0722)));
    vec3 lightTone = mix(mix(color, grey, 0.4), uSurface, 0.12);
    vec3 darkTone = mix(mix(color, grey, 0.35), uSurface, 0.2);
    return mix(darkTone, lightTone, uLight);
  }

  void main() {
    vec2 point = vPoint;
    float depth = point.y * uFacing;
    if (uWash > 0.5) {
      vec2 wash = getWash(point, depth) * uStrength;
      if (wash.x + wash.y <= 0.002) {
        discard;
      }
      vec3 washFill = mix(getMutedColor(uColor), uColor, 0.65);
      vec3 washLineDark = mix(uAccent, vec3(1.0), 0.45);
      vec3 washLineLight = mix(uColor, uAccent, 0.25);
      vec3 washLine = mix(washLineDark, washLineLight, uLight);
      float lineShare = clamp(wash.y / max(wash.x + wash.y, 0.001), 0.0, 1.0);
      vec3 washColor = mix(washFill, washLine, lineShare);
      float darkAlpha = clamp(wash.x * 0.7 + wash.y, 0.0, 1.0);
      float lightAlpha = clamp(wash.x * 0.5 + wash.y * 0.95, 0.0, 0.92);
      gl_FragColor = mix(vec4(washColor * mix(0.3, 1.0, lineShare), darkAlpha), vec4(washColor, lightAlpha), uLight);
      #include <colorspace_fragment>
      return;
    }
    float scanDensity = fwidth(depth) / SCAN_PITCH;
    float time = uTime * uFlow;
    float warp = getWarp(point, time);
    float envelope = getEnvelope(point, depth, warp) * uWeight;
    if (envelope <= 0.002) {
      discard;
    }
    float inward = uBounds.y - depth;
    float bentInward = inward + warp * 0.45;
    vec2 sweep = getSweep(bentInward, uTime);
    if (sweep.x + sweep.y <= 0.002) {
      discard;
    }
    float swells = getSwells(inward, point.x, warp, time);
    float shimmer = 0.0;
    float scan = 0.0;
    if (envelope * sweep.x > DETAIL_THRESHOLD) {
      shimmer = getShimmer(point, inward, swells, time) * (0.08 + swells * 0.4);
      scan = getScanlines(inward, time, scanDensity) * (0.05 + swells * 0.2);
    }
    vec2 crest = uFlow > 0.0 ? getCrest(bentInward, uTime) : vec2(0.0);
    vec2 surge = getSurge(bentInward, swells);
    float field = 0.3 + swells + shimmer * (1.0 + uSurge * 2.0) + scan + crest.y + surge.y;
    float highlight = (crest.x + surge.x) * sweep.x + sweep.y;
    float intensity = envelope * uStrength * (field * sweep.x + highlight * mix(1.0, 0.7, uLight));
    if (intensity <= 0.002) {
      discard;
    }
    vec3 sideColor = getMutedColor(uColor);
    vec3 accentColor = mix(getMutedColor(uAccent), vec3(1.0), mix(0.18, 0.5, uLight));
    vec3 tint = mix(sideColor, accentColor, clamp(highlight * 1.4 + shimmer * 0.6, 0.0, 0.7));
    vec3 glow = tint * 0.24;
    float glowAlpha = clamp(intensity, 0.0, 1.0);
    float washAlpha = clamp(intensity * 0.55, 0.0, 0.5);
    gl_FragColor = mix(vec4(glow, glowAlpha), vec4(tint, washAlpha), uLight);
    #include <colorspace_fragment>
  }
`;

export function buildActiveSideAuraMaterial(facing: number): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uSweepStart: { value: -100 },
      uActive: { value: 0 },
      uFlow: { value: 1 },
      uEnergy: { value: 1 },
      uLight: { value: 0 },
      uFacing: { value: facing },
      uWeight: { value: 0 },
      uSurge: { value: 0 },
      uSurgeStart: { value: -100 },
      uColor: { value: new Color() },
      uAccent: { value: new Color() },
      uSurface: { value: new Color() },
      uHalfSize: { value: new Vector2(1, 1) },
      uBounds: { value: new Vector2(1, 1) },
      uCenterDepth: { value: 0 },
      uStrength: { value: 1 },
      uCenterFade: { value: 2 },
      uBoundsFade: { value: 1.4 },
      uScreenFade: { value: new Vector2(0.12, 0.1) },
      uWash: { value: 0 },
    },
  });
}
