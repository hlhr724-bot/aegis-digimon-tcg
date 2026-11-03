import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  Matrix4,
  NormalBlending,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type InstancedMesh,
  type Vector4,
} from "three";
import { CARD_DIMENSIONS } from "@/design/webglCard/cardDimensions";
import type { ArenaSideColors } from "@/game/arena3d/ArenaSideColors";
import { ArenaZone } from "@/game/arena3d/ArenaZone";
import type { ArenaRowSlot } from "@/game/arena3d/field/ArenaRowSlot";
import type { ArenaTrackedField, ArenaTrackedZone } from "@/game/arena3d/field/ArenaTrackedField";
import { ARENA_SECURITY_LAYOUT, type ArenaLaneLayout } from "@/game/arena3d/field/arenaWorldLayout";
import type { ArenaFieldEffectState } from "@/game/arena3d/slots/ArenaFieldEffectState";
import { ArenaFieldEffectTone } from "@/game/arena3d/slots/ArenaFieldEffectTone";
import type { ArenaSlotTile } from "@/game/arena3d/slots/ArenaSlotTile";
import { ArenaSlotTileKind } from "@/game/arena3d/slots/ArenaSlotTileKind";
import { ARENA_SLOT_TILE_LAYOUT } from "@/game/arena3d/slots/arenaSlotTileLayout";
import { buildArenaSlotTileMaterial } from "@/game/arena3d/slots/buildArenaSlotTileMaterial";
import { computeArenaSlotTiles } from "@/game/arena3d/slots/computeArenaSlotTiles";
import { findArenaFieldEffectTone } from "@/game/arena3d/slots/findArenaFieldEffectTone";
import { Side } from "@/game/side";

type Props = {
  rows: Readonly<Record<Side, readonly ArenaRowSlot[]>>;
  lanes: ArenaLaneLayout;
  field: ArenaTrackedField;
  colors: ArenaSideColors;
  activeSide: number;
  fieldEffects: Readonly<Record<Side, ArenaFieldEffectState>>;
  reducedMotion: boolean;
};

type TileWriter = {
  mesh: InstancedMesh;
  attribute: InstancedBufferAttribute;
  count: number;
};

type EaseParams = {
  state: Vector4;
  drop: boolean;
  effect: boolean;
  active: boolean;
  delta: number;
};

const DROP_RATE = 12;
const EFFECT_RATE = 1.4;
const ACTIVE_RATE = 2.5;

const scratchMatrix = new Matrix4();
const scratchPosition = new Vector3();
const scratchScale = new Vector3();
const IDENTITY_ROTATION = new Quaternion();

function buildTileGeometry(): PlaneGeometry {
  const geometry = new PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const attribute = new InstancedBufferAttribute(new Float32Array(ARENA_SLOT_TILE_LAYOUT.maxTiles * 4), 4);
  attribute.setUsage(DynamicDrawUsage);
  geometry.setAttribute("aTile", attribute);
  return geometry;
}

function findShaderValue(kind: ArenaSlotTileKind): number {
  return Object.values(ArenaSlotTileKind).find((entry) => entry.value === kind)?.shaderValue ?? 0;
}

function writeTile(writer: TileWriter, tile: ArenaSlotTile): void {
  if (writer.count >= ARENA_SLOT_TILE_LAYOUT.maxTiles) {
    return;
  }
  scratchPosition.set(tile.x, ARENA_SLOT_TILE_LAYOUT.height, tile.z);
  scratchScale.set(tile.width, 1, tile.depth);
  scratchMatrix.compose(scratchPosition, IDENTITY_ROTATION, scratchScale);
  writer.mesh.setMatrixAt(writer.count, scratchMatrix);
  writer.attribute.setXYZW(
    writer.count,
    tile.width,
    tile.depth,
    findShaderValue(tile.kind),
    tile.side === Side.Viewer ? 1 : -1,
  );
  writer.count += 1;
}

function buildSecurityTile(zone: ArenaTrackedZone): ArenaSlotTile {
  const margin = zone.pose.width * ARENA_SLOT_TILE_LAYOUT.marginRatio * 2;
  return {
    side: zone.side,
    kind: ArenaSlotTileKind.SECURITY.value,
    x: zone.pose.x,
    z: zone.pose.z,
    width: zone.pose.width * CARD_DIMENSIONS.height + margin,
    depth: Math.max(ARENA_SECURITY_LAYOUT.maxDepth, zone.pose.width) + margin,
  };
}

function easeToward(current: number, target: number, rate: number, delta: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * delta));
}

function easeSideState({ state, drop, effect, active, delta }: EaseParams): void {
  state.x = easeToward(state.x, drop ? 1 : 0, DROP_RATE, delta);
  state.y = easeToward(state.y, effect ? 1 : 0, EFFECT_RATE, delta);
  state.z = easeToward(state.z, active ? 1 : 0, ACTIVE_RATE, delta);
}

export function ArenaSlotTiles({ rows, lanes, field, colors, activeSide, fieldEffects, reducedMotion }: Props) {
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(buildTileGeometry, []);
  const material = useMemo(buildArenaSlotTileMaterial, []);
  const rowTiles = useMemo(() => computeArenaSlotTiles({ rows, lanes }), [rows, lanes]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useEffect(() => {
    material.uniforms.uViewerColor!.value.set(colors.player);
    material.uniforms.uOpponentColor!.value.set(colors.opponent);
    material.uniforms.uLight!.value = colors.isLight ? 1 : 0;
    material.blending = colors.isLight ? NormalBlending : AdditiveBlending;
    material.needsUpdate = true;
  }, [material, colors.player, colors.opponent, colors.isLight]);

  useEffect(() => {
    const viewer = fieldEffects[Side.Viewer].tone;
    const opponent = fieldEffects[Side.Opponent].tone;
    if (viewer !== ArenaFieldEffectTone.NONE.value) {
      material.uniforms.uViewerEffectColor!.value.set(findArenaFieldEffectTone(viewer).color);
    }
    if (opponent !== ArenaFieldEffectTone.NONE.value) {
      material.uniforms.uOpponentEffectColor!.value.set(findArenaFieldEffectTone(opponent).color);
    }
  }, [material, fieldEffects]);

  useFrame((state, rawDelta) => {
    const target = mesh.current;
    if (!target) {
      return;
    }
    const delta = reducedMotion ? 1 : Math.min(rawDelta, 1 / 15);
    const uniforms = material.uniforms;
    uniforms.uTime!.value = reducedMotion ? 0 : state.clock.elapsedTime;
    easeSideState({
      state: uniforms.uViewerState!.value,
      drop: field.playDropSides.has(Side.Viewer),
      effect: fieldEffects[Side.Viewer].tone !== ArenaFieldEffectTone.NONE.value,
      active: activeSide > 0,
      delta,
    });
    easeSideState({
      state: uniforms.uOpponentState!.value,
      drop: field.playDropSides.has(Side.Opponent),
      effect: fieldEffects[Side.Opponent].tone !== ArenaFieldEffectTone.NONE.value,
      active: activeSide < 0,
      delta,
    });
    const writer: TileWriter = {
      mesh: target,
      attribute: geometry.getAttribute("aTile") as InstancedBufferAttribute,
      count: 0,
    };
    for (const tile of rowTiles) {
      writeTile(writer, tile);
    }
    for (const zone of field.zones.values()) {
      if (zone.zone === ArenaZone.SECURITY.value) {
        writeTile(writer, buildSecurityTile(zone));
      }
    }
    target.count = writer.count;
    target.instanceMatrix.needsUpdate = true;
    writer.attribute.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, ARENA_SLOT_TILE_LAYOUT.maxTiles]}
      frustumCulled={false}
      renderOrder={1}
    />
  );
}
