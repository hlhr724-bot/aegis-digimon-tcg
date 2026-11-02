import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, NormalBlending, Vector2, type Mesh, type ShaderMaterial } from "three";
import { CARD_DIMENSIONS } from "@/design/webglCard/cardDimensions";
import { buildActiveSideAuraMaterial } from "@/game/arena3d/buildActiveSideAuraMaterial";
import type { ArenaPulse } from "@/game/arena3d/ArenaPulse";
import { ArenaPulseKind } from "@/game/arena3d/ArenaPulseKind";
import type { ArenaSideColors } from "@/game/arena3d/ArenaSideColors";
import type { ArenaLayoutVariantEntry } from "@/game/arena3d/field/ArenaLayoutVariant";
import { ARENA_ROW_LAYOUT } from "@/game/arena3d/field/arenaWorldLayout";
import type { Arena3dQualityEntry } from "@/game/arena3d/quality/Arena3dQuality";
import { Side } from "@/game/side";
import { FINALE_IMPACT_AT_MS } from "@/game/timings";

type Props = {
  colors: ArenaSideColors;
  layout: ArenaLayoutVariantEntry;
  activeSide: number;
  quality: Arena3dQualityEntry;
  reducedMotion: boolean;
  pulses: readonly ArenaPulse[];
};

type Surge = {
  side: Side | undefined;
  startedAt: number;
};

type SurgeStrengthParams = {
  surge: Surge;
  side: Side;
  time: number;
  reducedMotion: boolean;
};

type SideMaterialParams = {
  material: ShaderMaterial;
  color: string;
  accent: string;
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
  rate: number;
};

const AURA_HEIGHT = 0.004;
const VISIBLE_WEIGHT = 0.001;
const FADE_IN_RATE = 6;
const FADE_OUT_RATE = 1.2;
const SWEEP_CLEAR_SECONDS = 2.2;
const CARD_DEPTH = ARENA_ROW_LAYOUT.cardWidth * CARD_DIMENSIONS.height;
const AURA_MARGIN_X = 1.5;
const AURA_MARGIN_Z = 0.55;
const BOUNDS_OVERSHOOT = 0.5;
const SURGE_RISE_SECONDS = 0.12;
const SURGE_DECAY_RATE = 1.4;
const SURGE_SECONDS = 2.6;
const CALM_SURGE_PEAK = 0.45;

function measureAuraRegion({ lanes }: ArenaLayoutVariantEntry): AuraRegion {
  const gridHalfWidth = ((ARENA_ROW_LAYOUT.columns - 1) / 2) * lanes.columnPitch + ARENA_ROW_LAYOUT.cardWidth / 2;
  const gridNear = lanes.digimonDepth - CARD_DEPTH / 2;
  const gridFar = lanes.supportDepth + CARD_DEPTH / 2;
  return {
    halfSize: new Vector2(gridHalfWidth + AURA_MARGIN_X, (gridFar - gridNear) / 2 + AURA_MARGIN_Z),
    centerDepth: (gridNear + gridFar) / 2,
  };
}

function easeTowardTarget({ current, target, delta, rate }: EaseParams): number {
  return current + (target - current) * (1 - Math.exp(-rate * delta));
}

function getSurgeStrength({ surge, side, time, reducedMotion }: SurgeStrengthParams): number {
  const age = time - surge.startedAt;
  if (surge.side !== side || age < 0 || age > SURGE_SECONDS) {
    return 0;
  }
  const rise = Math.min(1, age / SURGE_RISE_SECONDS);
  const decay = Math.exp(-Math.max(0, age - SURGE_RISE_SECONDS) * SURGE_DECAY_RATE);
  return rise * decay * (reducedMotion ? CALM_SURGE_PEAK : 1);
}

function applySideColors({ material, color, accent, colors }: SideMaterialParams) {
  const uniforms = material.uniforms;
  uniforms.uColor!.value.set(color);
  uniforms.uAccent!.value.set(accent);
  uniforms.uSurface!.value.set(colors.surface);
  uniforms.uLight!.value = colors.isLight ? 1 : 0;
  material.blending = colors.isLight ? NormalBlending : AdditiveBlending;
  material.needsUpdate = true;
}

export function ArenaActiveSideAura({ colors, layout, activeSide, quality, reducedMotion, pulses }: Props) {
  const viewerMaterial = useMemo(() => buildActiveSideAuraMaterial(1), []);
  const opponentMaterial = useMemo(() => buildActiveSideAuraMaterial(-1), []);
  const viewerMesh = useRef<Mesh>(null);
  const opponentMesh = useRef<Mesh>(null);
  const surge = useRef<Surge>({ side: undefined, startedAt: -100 });
  const surgePending = useRef<Side | undefined>(undefined);
  const seenFinales = useRef(new Set<string>());
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
    applySideColors({ material: viewerMaterial, color: colors.player, accent: colors.playerAccent, colors });
    applySideColors({ material: opponentMaterial, color: colors.opponent, accent: colors.opponentAccent, colors });
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
    for (const pulse of pulses) {
      if (pulse.kind !== ArenaPulseKind.FINALE.value || seenFinales.current.has(pulse.key)) {
        continue;
      }
      seenFinales.current.add(pulse.key);
      surgePending.current = pulse.side;
    }
  }, [pulses]);

  useFrame((state, rawDelta) => {
    const delta = reducedMotion ? 1 : Math.min(rawDelta, 1 / 15);
    const time = state.clock.elapsedTime;
    if (surgePending.current) {
      surge.current = {
        side: surgePending.current,
        startedAt: time + (reducedMotion ? 0 : FINALE_IMPACT_AT_MS / 1000),
      };
      surgePending.current = undefined;
    }
    const sides = [
      { material: viewerMaterial, mesh: viewerMesh.current, side: Side.Viewer, active: activeSide > 0 },
      { material: opponentMaterial, mesh: opponentMesh.current, side: Side.Opponent, active: activeSide < 0 },
    ];
    for (const { material, mesh, side, active } of sides) {
      const uniforms = material.uniforms;
      const surgeStrength = getSurgeStrength({ surge: surge.current, side, time, reducedMotion });
      const target = active || surgeStrength > 0 ? 1 : 0;
      if (uniforms.uActive!.value !== target) {
        uniforms.uActive!.value = target;
        uniforms.uSweepStart!.value = time;
      }
      uniforms.uTime!.value = time;
      uniforms.uSurge!.value = surgeStrength;
      uniforms.uSurgeStart!.value = surge.current.startedAt;
      uniforms.uWeight!.value = easeTowardTarget({
        current: uniforms.uWeight!.value,
        target,
        delta,
        rate: target === 1 ? FADE_IN_RATE : FADE_OUT_RATE,
      });
      if (mesh) {
        const sweptAway =
          target === 0 && time - uniforms.uSweepStart!.value > (reducedMotion ? 0 : SWEEP_CLEAR_SECONDS);
        mesh.visible = uniforms.uWeight!.value > VISIBLE_WEIGHT && !sweptAway;
      }
    }
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
