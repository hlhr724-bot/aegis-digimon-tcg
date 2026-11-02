import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, InstancedBufferAttribute, InstancedBufferGeometry, PlaneGeometry } from "three";
import type { ArenaActivity } from "@/game/arena3d/ArenaActivity";
import type { ArenaSideColors } from "@/game/arena3d/ArenaSideColors";
import type { ArenaRippleBuffer } from "@/game/arena3d/createArenaRippleBuffer";
import { getArenaMemoryCoinX } from "@/game/arena3d/field/getArenaMemoryCoinX";
import { buildArenaMemoryCoinMaterial } from "@/game/arena3d/memory/buildArenaMemoryCoinMaterial";
import { buildArenaMemoryMarkerMaterial } from "@/game/arena3d/memory/buildArenaMemoryMarkerMaterial";
import { buildArenaMemoryRailMaterial } from "@/game/arena3d/memory/buildArenaMemoryRailMaterial";
import { createArenaMemoryDigitAtlas } from "@/game/arena3d/memory/createArenaMemoryDigitAtlas";
import { pushArenaRipple } from "@/game/arena3d/pushArenaRipple";
import { clampMemory, MEMORY_CELL_COUNT, MEMORY_MAX } from "@/game/memoryArc";

type Props = {
  memory: number;
  prediction: number | undefined;
  scale: number;
  colors: ArenaSideColors;
  ripples: ArenaRippleBuffer;
  activity: RefObject<ArenaActivity>;
  reducedMotion: boolean;
};

type MarkerState = {
  value: number;
  target: number;
  rippleStartedAt: number;
  colored: boolean;
};

const MARKER_RATE = 7;
const RIPPLE_SECONDS = 0.9;
const COLOR_RATE = 8;
const ZERO_MARKER_COLOR = "#f2f5fb";
const ANIMATION_BUSY_MS = 1600;
const NO_PREDICTION = 99;

function buildCoinGeometry(): InstancedBufferGeometry {
  const base = new PlaneGeometry(1, 1);
  const geometry = new InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.setAttribute("position", base.getAttribute("position"));
  const values = Float32Array.from({ length: MEMORY_CELL_COUNT }, (_, index) => MEMORY_MAX - index);
  geometry.setAttribute("aValue", new InstancedBufferAttribute(values, 1));
  geometry.instanceCount = MEMORY_CELL_COUNT;
  return geometry;
}

function getMarkerColor(memory: number, colors: ArenaSideColors): string {
  if (memory > 0) {
    return colors.player;
  }
  if (memory < 0) {
    return colors.opponent;
  }
  return ZERO_MARKER_COLOR;
}

function getPredictionUniform(memory: number, prediction: number | undefined): number {
  if (prediction === undefined || clampMemory(prediction) === memory) {
    return NO_PREDICTION;
  }
  return clampMemory(prediction);
}

export function ArenaMemoryTrack({ memory, prediction, scale, colors, ripples, activity, reducedMotion }: Props) {
  const target = clampMemory(memory);
  const digits = useMemo(createArenaMemoryDigitAtlas, []);
  const quad = useMemo(() => new PlaneGeometry(1, 1), []);
  const coinGeometry = useMemo(buildCoinGeometry, []);
  const coinMaterial = useMemo(() => buildArenaMemoryCoinMaterial(digits), [digits]);
  const railMaterial = useMemo(buildArenaMemoryRailMaterial, []);
  const markerMaterial = useMemo(() => buildArenaMemoryMarkerMaterial(colors.isLight), [colors.isLight]);
  const markerColor = useMemo(() => new Color(), []);
  const markerTargetColor = useMemo(() => new Color(), []);
  const state = useRef<MarkerState>({ value: target, target, rippleStartedAt: -100, colored: false });

  useEffect(
    () => () => {
      digits.dispose();
      quad.dispose();
      coinGeometry.dispose();
      coinMaterial.dispose();
      railMaterial.dispose();
    },
    [digits, quad, coinGeometry, coinMaterial, railMaterial],
  );

  useEffect(() => () => markerMaterial.dispose(), [markerMaterial]);

  useEffect(() => {
    for (const material of [coinMaterial, railMaterial]) {
      material.uniforms.uPlayer!.value.set(colors.player);
      material.uniforms.uOpponent!.value.set(colors.opponent);
    }
  }, [coinMaterial, railMaterial, colors.player, colors.opponent]);

  useFrame((frameState, rawDelta) => {
    const now = frameState.clock.elapsedTime;
    const delta = Math.min(rawDelta, 1 / 15);
    const marker = state.current;
    if (marker.target !== target) {
      marker.target = target;
      if (reducedMotion) {
        marker.value = target;
      } else {
        marker.rippleStartedAt = now;
        pushArenaRipple({
          buffer: ripples,
          x: getArenaMemoryCoinX(target) * scale,
          z: 0,
          startedAt: now,
          strength: 0.45,
          color: getMarkerColor(target, colors),
        });
        activity.current.busyUntil = Math.max(activity.current.busyUntil, performance.now() + ANIMATION_BUSY_MS);
      }
    }
    const blend = reducedMotion ? 1 : 1 - Math.exp(-MARKER_RATE * delta);
    marker.value += (marker.target - marker.value) * blend;
    if (Math.abs(marker.target - marker.value) < 0.002) {
      marker.value = marker.target;
    }
    markerTargetColor.set(getMarkerColor(target, colors));
    if (marker.colored && !reducedMotion) {
      markerColor.lerp(markerTargetColor, 1 - Math.exp(-COLOR_RATE * delta));
    } else {
      markerColor.copy(markerTargetColor);
      marker.colored = true;
    }
    const ripple = Math.min(1, Math.max(0, (now - marker.rippleStartedAt) / RIPPLE_SECONDS));
    coinMaterial.uniforms.uMarker!.value = marker.value;
    coinMaterial.uniforms.uPrediction!.value = getPredictionUniform(target, prediction);
    coinMaterial.uniforms.uTime!.value = now;
    markerMaterial.uniforms.uCenter!.value = getArenaMemoryCoinX(marker.value);
    markerMaterial.uniforms.uColor!.value.copy(markerColor);
    markerMaterial.uniforms.uTime!.value = reducedMotion ? 0 : now;
    markerMaterial.uniforms.uRipple!.value = ripple;
    markerMaterial.uniforms.uStrength!.value = colors.isLight ? 0.8 : 1;
  });

  return (
    <group scale={[scale, 1, scale]}>
      <mesh geometry={quad} material={railMaterial} frustumCulled={false} renderOrder={1} />
      <mesh geometry={coinGeometry} material={coinMaterial} frustumCulled={false} renderOrder={2} />
      <mesh geometry={quad} material={markerMaterial} frustumCulled={false} renderOrder={3} />
    </group>
  );
}
