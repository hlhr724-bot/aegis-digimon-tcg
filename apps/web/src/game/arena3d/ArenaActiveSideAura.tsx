import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color, NormalBlending, ShaderMaterial, Vector2, type Mesh } from "three";
import { CARD_DIMENSIONS } from "@/design/webglCard/cardDimensions";
import { ARENA_NOISE_GLSL } from "@/game/arena3d/arenaNoiseGlsl";
import type { ArenaSideColors } from "@/game/arena3d/ArenaSideColors";
import type { ArenaLayoutVariantEntry } from "@/game/arena3d/field/ArenaLayoutVariant";
import { ARENA_ROW_LAYOUT } from "@/game/arena3d/field/arenaWorldLayout";
import type { Arena3dQualityEntry } from "@/game/arena3d/quality/Arena3dQuality";

type Props = {
  colors: ArenaSideColors;
  layout: ArenaLayoutVariantEntry;
  activeSide: number;
  quality: Arena3dQualityEntry;
  reducedMotion: boolean;
};

type SideMaterialParams = {
  material: ShaderMaterial;
  color: string;
  colors: ArenaSideColors;
};

type AuraRegion = {
  halfSize: Vector2;
  centerDepth: number;
};

type EaseParams = {
  current: number;
  target: number;
  delta: number;
};

const AURA_HEIGHT = 0.004;
const VISIBLE_WEIGHT = 0.001;
const CROSSFADE_RATE = 1.6;
const CARD_DEPTH = ARENA_ROW_LAYOUT.cardWidth * CARD_DIMENSIONS.height;
const AURA_MARGIN_X = 1.5;
const AURA_MARGIN_Z = 0.55;
const BOUNDS_OVERSHOOT = 0.5;

function measureAuraRegion({ lanes }: ArenaLayoutVariantEntry): AuraRegion {
  const gridHalfWidth = ((ARENA_ROW_LAYOUT.columns - 1) / 2) * lanes.columnPitch + ARENA_ROW_LAYOUT.cardWidth / 2;
  const gridNear = lanes.digimonDepth - CARD_DEPTH / 2;
  const gridFar = lanes.supportDepth + CARD_DEPTH / 2;
  return {
    halfSize: new Vector2(gridHalfWidth + AURA_MARGIN_X, (gridFar - gridNear) / 2 + AURA_MARGIN_Z),
    centerDepth: (gridNear + gridFar) / 2,
  };
}

function easeTowardTarget({ current, target, delta }: EaseParams): number {
  return current + (target - current) * (1 - Math.exp(-CROSSFADE_RATE * delta));
}

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
  uniform float uStart;
  uniform float uFlow;
  uniform float uEnergy;
  uniform float uLight;
  uniform float uFacing;
  uniform float uWeight;
  uniform vec3 uColor;
  uniform vec3 uSurface;
  uniform vec2 uHalfSize;
  uniform vec2 uBounds;
  uniform float uCenterDepth;
  varying vec2 vPoint;
  varying vec4 vClip;
  const float AURA_CORNER = 2.4;
  const float AURA_FALLOFF = 2.0;
  const float BOUNDS_CORNER = 1.8;
  const float BOUNDS_FADE = 1.4;
  const vec2 SCREEN_FADE = vec2(0.12, 0.1);
  const float CENTER_FADE = 1.4;
  const float CREST_PERIOD = 5.5;
  const float CREST_SPEED = 1.3;
  const float CREST_WIDTH = 0.24;
  const float CREST_REACH = 6.0;

  float getRoundedBoxDistance(vec2 local, vec2 halfSize, float corner) {
    vec2 edge = abs(local) - (halfSize - corner);
    return length(max(edge, 0.0)) + min(max(edge.x, edge.y), 0.0) - corner;
  }

  float getScreenFade() {
    vec2 screen = abs(vClip.xy / vClip.w);
    vec2 fade = smoothstep(vec2(1.0), vec2(1.0) - SCREEN_FADE, screen);
    return fade.x * fade.y;
  }

  float getSway(float across, float time) {
    return sin(across * 0.55 + time * 0.35) * 0.32 + sin(across * 0.21 - time * 0.23) * 0.24;
  }

  float getEnvelope(vec2 point, float depth, float sway) {
    float region = getRoundedBoxDistance(vec2(point.x, depth - uCenterDepth), uHalfSize, AURA_CORNER) - sway;
    float spread = max(region, 0.0) / AURA_FALLOFF;
    float body = exp(-spread * spread);
    float bounds = getRoundedBoxDistance(point, uBounds, BOUNDS_CORNER);
    float boundsFade = smoothstep(0.0, BOUNDS_FADE, -bounds);
    float centerFade = smoothstep(0.0, CENTER_FADE, depth);
    return body * boundsFade * centerFade * getScreenFade();
  }

  float getBands(vec2 point, float travel, float time) {
    float drift = uEnergy > 0.0 ? (valueNoise(vec2(point.x * 0.14 + time * 0.04, travel * 0.18 - time * 0.06)) - 0.5) * 1.6 : 0.0;
    float broad = 0.5 + 0.5 * sin(travel * 1.7 - time * 1.1 + drift);
    float slow = 0.5 + 0.5 * sin(travel * 0.8 + point.x * 0.2 - time * 0.5 - drift * 0.5);
    return broad * 0.28 + slow * 0.18;
  }

  float getCrest(float travel, float time) {
    float cycle = mod(max(time - uStart, 0.0), CREST_PERIOD);
    float front = cycle * CREST_SPEED - 0.4;
    float behind = front - travel;
    float line = exp(-(behind * behind) / (CREST_WIDTH * CREST_WIDTH));
    float wake = smoothstep(-0.3, 0.2, behind) * exp(-max(behind, 0.0) / 1.5);
    float life = smoothstep(0.0, 0.6, cycle) * (1.0 - smoothstep(CREST_REACH * 0.35, CREST_REACH, front));
    return (line * 0.55 + wake * 0.18) * life;
  }

  float getSideIntensity(vec2 point, float facing) {
    float depth = point.y * facing;
    float time = uTime * uFlow;
    float sway = getSway(point.x, time);
    float envelope = getEnvelope(point, depth, sway);
    if (envelope <= 0.002) {
      return 0.0;
    }
    float travel = depth + sway * 0.8;
    float crest = uFlow > 0.0 ? getCrest(travel, time) : 0.0;
    return envelope * (0.42 + getBands(point, travel, time) + crest);
  }

  vec3 getMutedColor(vec3 color) {
    vec3 grey = vec3(dot(color, vec3(0.2126, 0.7152, 0.0722)));
    vec3 lightTone = mix(mix(color, grey, 0.4), uSurface, 0.12);
    vec3 darkTone = mix(mix(color, grey, 0.35), uSurface, 0.2);
    return mix(darkTone, lightTone, uLight);
  }

  void main() {
    float intensity = getSideIntensity(vPoint, uFacing) * uWeight;
    if (intensity <= 0.002) {
      discard;
    }
    vec3 sideColor = getMutedColor(uColor);
    vec3 glow = sideColor * 0.24;
    float glowAlpha = clamp(intensity, 0.0, 1.0);
    float washAlpha = clamp(intensity * 0.55, 0.0, 0.5);
    gl_FragColor = mix(vec4(glow, glowAlpha), vec4(sideColor, washAlpha), uLight);
    #include <colorspace_fragment>
  }
`;

function buildActiveSideAuraMaterial(facing: number): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uStart: { value: 0 },
      uFlow: { value: 1 },
      uEnergy: { value: 1 },
      uLight: { value: 0 },
      uFacing: { value: facing },
      uWeight: { value: 0 },
      uColor: { value: new Color() },
      uSurface: { value: new Color() },
      uHalfSize: { value: new Vector2(1, 1) },
      uBounds: { value: new Vector2(1, 1) },
      uCenterDepth: { value: 0 },
    },
  });
}

function applySideColors({ material, color, colors }: SideMaterialParams) {
  const uniforms = material.uniforms;
  uniforms.uColor!.value.set(color);
  uniforms.uSurface!.value.set(colors.surface);
  uniforms.uLight!.value = colors.isLight ? 1 : 0;
  material.blending = colors.isLight ? NormalBlending : AdditiveBlending;
  material.needsUpdate = true;
}

export function ArenaActiveSideAura({ colors, layout, activeSide, quality, reducedMotion }: Props) {
  const viewerMaterial = useMemo(() => buildActiveSideAuraMaterial(1), []);
  const opponentMaterial = useMemo(() => buildActiveSideAuraMaterial(-1), []);
  const viewerMesh = useRef<Mesh>(null);
  const opponentMesh = useRef<Mesh>(null);
  const crestPending = useRef(true);
  const halfWidth = layout.bounds.halfWidth + BOUNDS_OVERSHOOT;
  const halfDepth = layout.bounds.halfDepth + BOUNDS_OVERSHOOT;

  useEffect(
    () => () => {
      viewerMaterial.dispose();
      opponentMaterial.dispose();
    },
    [viewerMaterial, opponentMaterial],
  );

  useEffect(() => {
    applySideColors({ material: viewerMaterial, color: colors.player, colors });
    applySideColors({ material: opponentMaterial, color: colors.opponent, colors });
  }, [viewerMaterial, opponentMaterial, colors]);

  useEffect(() => {
    const region = measureAuraRegion(layout);
    for (const material of [viewerMaterial, opponentMaterial]) {
      material.uniforms.uHalfSize!.value.copy(region.halfSize);
      material.uniforms.uBounds!.value.set(halfWidth, halfDepth);
      material.uniforms.uCenterDepth!.value = region.centerDepth;
    }
  }, [viewerMaterial, opponentMaterial, layout, halfWidth, halfDepth]);

  useEffect(() => {
    for (const material of [viewerMaterial, opponentMaterial]) {
      material.uniforms.uEnergy!.value = quality.floorEnergy ? 1 : 0;
      material.uniforms.uFlow!.value = reducedMotion ? 0 : 1;
    }
  }, [viewerMaterial, opponentMaterial, quality.floorEnergy, reducedMotion]);

  useEffect(() => {
    if (activeSide !== 0) {
      crestPending.current = true;
    }
  }, [activeSide]);

  useFrame((state, rawDelta) => {
    const delta = reducedMotion ? 1 : Math.min(rawDelta, 1 / 15);
    const time = state.clock.elapsedTime;
    const sides = [
      { material: viewerMaterial, mesh: viewerMesh.current, target: activeSide > 0 ? 1 : 0 },
      { material: opponentMaterial, mesh: opponentMesh.current, target: activeSide < 0 ? 1 : 0 },
    ];
    for (const { material, mesh, target } of sides) {
      const uniforms = material.uniforms;
      uniforms.uTime!.value = time;
      uniforms.uWeight!.value = easeTowardTarget({ current: uniforms.uWeight!.value, target, delta });
      if (crestPending.current && target === 1) {
        uniforms.uStart!.value = time;
      }
      if (mesh) {
        mesh.visible = uniforms.uWeight!.value > VISIBLE_WEIGHT;
      }
    }
    crestPending.current = false;
  });

  return (
    <>
      <mesh
        ref={viewerMesh}
        rotation-x={-Math.PI / 2}
        position={[0, AURA_HEIGHT, halfDepth / 2]}
        scale={[halfWidth * 2, halfDepth, 1]}
        material={viewerMaterial}
        renderOrder={-5}
        frustumCulled={false}
        visible={false}
      >
        <planeGeometry />
      </mesh>
      <mesh
        ref={opponentMesh}
        rotation-x={-Math.PI / 2}
        position={[0, AURA_HEIGHT, -halfDepth / 2]}
        scale={[halfWidth * 2, halfDepth, 1]}
        material={opponentMaterial}
        renderOrder={-5}
        frustumCulled={false}
        visible={false}
      >
        <planeGeometry />
      </mesh>
    </>
  );
}
