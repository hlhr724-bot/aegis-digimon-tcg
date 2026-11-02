import { memo, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color, NormalBlending, type Mesh, type ShaderMaterial } from "three";
import { CARD_DIMENSIONS } from "@/design/webglCard/cardDimensions";
import type { CardTextureCache } from "@/design/webglCard/createCardTextureCache";
import type { ArenaCardMotionSample } from "@/game/arena3d/effects/createArenaCardMotionRegistry";
import type { ArenaZoneCard } from "@/game/arena3d/field/ArenaFieldCard";
import type { ArenaCardPose, ArenaTrackedField } from "@/game/arena3d/field/ArenaTrackedField";
import type { ArenaSideColors } from "@/game/arena3d/ArenaSideColors";
import { ArenaZone } from "@/game/arena3d/ArenaZone";
import { Side } from "@/game/side";
import { CARD_FLOOR_HEIGHT } from "@/game/arena3d/arenaSceneLayout";
import { ARENA_SECURITY_LAYOUT } from "@/game/arena3d/field/arenaWorldLayout";
import { ArenaCardFace } from "@/game/arena3d/meshes/ArenaCardFace";
import {
  ARENA_CARD_GLOW_GEOMETRY,
  ARENA_CARD_GLOW_MARGIN,
  ARENA_CARD_SHADOW_GEOMETRY,
} from "@/game/arena3d/meshes/arenaCardGeometry";
import type { ArenaRimEntry } from "@/game/arena3d/meshes/ArenaRim";
import { applyArenaCardGlow } from "@/game/arena3d/meshes/applyArenaCardGlow";
import { buildArenaCardGlowMaterial } from "@/game/arena3d/meshes/buildArenaCardGlowMaterial";
import { buildArenaCardShadowMaterial } from "@/game/arena3d/meshes/buildArenaCardShadowMaterial";
import { getArenaAuraTarget } from "@/game/arena3d/meshes/getArenaAuraTarget";
import { placeArenaCardMesh } from "@/game/arena3d/meshes/placeArenaCardMesh";

type Props = {
  zoneKey: string;
  zone: ArenaZoneCard;
  field: ArenaTrackedField;
  cache: CardTextureCache;
  colors: ArenaSideColors;
  activeSide: number;
  reducedMotion: boolean;
};

type GlowPlaceParams = {
  mesh: Mesh;
  material: ShaderMaterial;
  pose: ArenaCardPose;
  stackDepth: number;
  height: number;
};

type RimApplyParams = {
  meshes: readonly (Mesh | null)[];
  rim: ArenaRimEntry | undefined;
  time: number;
};

const MAX_PILE_LAYERS = 7;
const MAX_SECURITY_TILES = 10;
const PILE_LAYER_HEIGHT = 0.022;
const ZONE_AURA_SCALE = 0.6;

const REST_MOTION: ArenaCardMotionSample = {
  offsetX: 0,
  offsetZ: 0,
  lift: 0,
  tilt: 0,
  roll: 0,
  spin: 0,
  scale: 1,
  flash: 0,
};

function countLayers(zone: ArenaZoneCard, security: boolean): number {
  if (zone.count <= 0) {
    return 0;
  }
  if (security) {
    return Math.min(MAX_SECURITY_TILES, zone.count);
  }
  return Math.min(MAX_PILE_LAYERS, Math.max(1, Math.ceil(zone.count / 6)));
}

function getSecurityStep(tileWidth: number, layerCount: number): number {
  if (layerCount <= 1) {
    return 0;
  }
  const spread = Math.max(0, ARENA_SECURITY_LAYOUT.maxDepth - tileWidth) / (layerCount - 1);
  return Math.min(ARENA_SECURITY_LAYOUT.tileStep, spread);
}

function placeStackGlow({ mesh, material, pose, stackDepth, height }: GlowPlaceParams): void {
  const margin = ARENA_CARD_GLOW_MARGIN * 2;
  const stackWidth = CARD_DIMENSIONS.width + stackDepth / pose.width;
  material.uniforms.uCard!.value.set(stackWidth, CARD_DIMENSIONS.height);
  mesh.visible = true;
  mesh.position.set(pose.x, height, pose.z);
  mesh.rotation.set(0, pose.yaw, 0);
  mesh.scale.set(
    (pose.width * (stackWidth + margin)) / (CARD_DIMENSIONS.width + margin),
    1,
    (pose.width * (CARD_DIMENSIONS.height + margin)) / (CARD_DIMENSIONS.height + margin),
  );
}

function applyTileRim({ meshes, rim, time }: RimApplyParams): void {
  for (const mesh of meshes) {
    if (!mesh) {
      continue;
    }
    const material = mesh.material as ShaderMaterial;
    material.uniforms.uRimStrength!.value = rim?.strength ?? 0;
    material.uniforms.uTime!.value = time;
    if (rim) {
      material.uniforms.uRimColor!.value.set(rim.color);
    }
  }
}

function ArenaZoneMeshView({ zoneKey, zone, field, cache, colors, activeSide, reducedMotion }: Props) {
  const layers = useRef<(Mesh | null)[]>([]);
  const top = useRef<Mesh | null>(null);
  const shadow = useRef<Mesh>(null);
  const glow = useRef<Mesh>(null);
  const aura = useRef(0);
  const shadowMaterial = useMemo(buildArenaCardShadowMaterial, []);
  const glowMaterial = useMemo(buildArenaCardGlowMaterial, []);
  const security = zoneKey.endsWith(`:${ArenaZone.SECURITY.value}`);
  const layerCount = countLayers(zone, security);
  const auraColors = useMemo(
    () => ({ [Side.Viewer]: new Color(colors.player), [Side.Opponent]: new Color(colors.opponent) }),
    [colors.player, colors.opponent],
  );

  useEffect(
    () => () => {
      shadowMaterial.dispose();
      glowMaterial.dispose();
    },
    [shadowMaterial, glowMaterial],
  );

  useEffect(() => {
    glowMaterial.blending = colors.isLight ? NormalBlending : AdditiveBlending;
    glowMaterial.uniforms.uLight!.value = colors.isLight ? 1 : 0;
    glowMaterial.needsUpdate = true;
  }, [glowMaterial, colors.isLight]);

  useFrame((state, delta) => {
    const tracked = field.zones.get(zoneKey);
    if (!tracked || layerCount === 0) {
      for (const mesh of [...layers.current, top.current, shadow.current, glow.current]) {
        if (mesh) {
          mesh.visible = false;
        }
      }
      return;
    }
    const pose = security ? { ...tracked.pose, yaw: tracked.pose.yaw + Math.PI / 2 } : tracked.pose;
    const fanStep = security ? getSecurityStep(pose.width, layerCount) : 0;
    const fanOffset = ((layerCount - 1) * fanStep) / 2;
    layers.current.forEach((mesh, index) => {
      if (!mesh) {
        return;
      }
      if (index >= layerCount - 1) {
        mesh.visible = false;
        return;
      }
      placeArenaCardMesh({
        mesh,
        pose: { ...pose, z: pose.z + fanOffset - index * fanStep },
        motion: REST_MOTION,
        height: CARD_FLOOR_HEIGHT + index * PILE_LAYER_HEIGHT,
      });
    });
    if (top.current) {
      placeArenaCardMesh({
        mesh: top.current,
        pose: { ...pose, z: pose.z + fanOffset - (layerCount - 1) * fanStep },
        motion: REST_MOTION,
        height: CARD_FLOOR_HEIGHT + (layerCount - 1) * PILE_LAYER_HEIGHT,
      });
    }
    if (shadow.current) {
      const stackDepth = (layerCount - 1) * fanStep;
      shadow.current.visible = true;
      shadow.current.position.set(pose.x, 0.01, pose.z);
      shadow.current.rotation.set(0, pose.yaw, 0);
      if (security) {
        shadow.current.scale.set(pose.width + stackDepth, 1, pose.width);
      } else {
        shadow.current.scale.set(pose.width, 1, pose.width);
      }
      shadowMaterial.uniforms.uStrength!.value = 0.5 + Math.min(0.3, layerCount * 0.04);
    }
    const time = state.clock.elapsedTime;
    applyTileRim({ meshes: [...layers.current, top.current], rim: tracked.rim, time });
    const auraTarget = getArenaAuraTarget({ side: tracked.side, activeSide, time, reducedMotion }) * ZONE_AURA_SCALE;
    aura.current += (auraTarget - aura.current) * Math.min(1, delta * 1.5);
    if (glow.current) {
      placeStackGlow({
        mesh: glow.current,
        material: glowMaterial,
        pose,
        stackDepth: (layerCount - 1) * fanStep,
        height: CARD_FLOOR_HEIGHT - PILE_LAYER_HEIGHT * 0.5,
      });
      applyArenaCardGlow({
        material: glowMaterial,
        rim: tracked.rim,
        auraColor: auraColors[tracked.side],
        aura: aura.current,
        time,
      });
    }
  });

  return (
    <group>
      <mesh ref={shadow} geometry={ARENA_CARD_SHADOW_GEOMETRY} material={shadowMaterial} visible={false} />
      <mesh ref={glow} geometry={ARENA_CARD_GLOW_GEOMETRY} material={glowMaterial} visible={false} />
      {Array.from({ length: Math.max(0, layerCount - 1) }, (_, index) => (
        <ArenaCardFace
          key={index}
          urls={zone.layerUrls}
          cache={cache}
          tint={zone.layerTint}
          registerMesh={(mesh) => {
            layers.current[index] = mesh;
          }}
        />
      ))}
      {layerCount > 0 ? (
        <ArenaCardFace
          urls={zone.topUrls}
          cache={cache}
          tint={zone.topTint}
          registerMesh={(mesh) => {
            top.current = mesh;
          }}
        />
      ) : null}
    </group>
  );
}

export const ArenaZoneMesh = memo(ArenaZoneMeshView);
