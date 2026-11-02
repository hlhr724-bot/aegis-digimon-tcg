import { memo, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color, NormalBlending, Vector3, type Camera, type Mesh, type ShaderMaterial } from "three";
import type { CardTextureCache } from "@/design/webglCard/createCardTextureCache";
import type {
  ArenaCardMotionRegistry,
  ArenaCardMotionSample,
} from "@/game/arena3d/effects/createArenaCardMotionRegistry";
import type { ArenaFieldCard } from "@/game/arena3d/field/ArenaFieldCard";
import type { ArenaTrackedField } from "@/game/arena3d/field/ArenaTrackedField";
import { followArenaProxy } from "@/game/arena3d/field/followArenaProxy";
import type { ArenaSideColors } from "@/game/arena3d/ArenaSideColors";
import { Side } from "@/game/side";
import { CARD_FLOOR_HEIGHT } from "@/game/arena3d/arenaSceneLayout";
import { applyArenaCardCue } from "@/game/arena3d/cues/applyArenaCardCue";
import { ArenaCardFace } from "@/game/arena3d/meshes/ArenaCardFace";
import { ARENA_CARD_GLOW_GEOMETRY, ARENA_CARD_SHADOW_GEOMETRY } from "@/game/arena3d/meshes/arenaCardGeometry";
import { applyArenaCardGlow } from "@/game/arena3d/meshes/applyArenaCardGlow";
import { buildArenaCardGlowMaterial } from "@/game/arena3d/meshes/buildArenaCardGlowMaterial";
import { buildArenaCardShadowMaterial } from "@/game/arena3d/meshes/buildArenaCardShadowMaterial";
import { getArenaAuraTarget } from "@/game/arena3d/meshes/getArenaAuraTarget";
import { placeArenaCardMesh } from "@/game/arena3d/meshes/placeArenaCardMesh";

type Props = {
  id: string;
  card: ArenaFieldCard;
  field: ArenaTrackedField;
  cache: CardTextureCache;
  motions: ArenaCardMotionRegistry;
  colors: ArenaSideColors;
  activeSide: number;
  projectionCamera: Camera;
  reducedMotion: boolean;
};

const LAYER_STEP = 0.006;
const SOURCE_SHADE = 0.66;
const TOP_FRAME_STRENGTH = 0.92;
const SOURCE_FRAME_STRENGTH = 0.7;

function createSample(): ArenaCardMotionSample {
  return { offsetX: 0, offsetZ: 0, lift: 0, tilt: 0, roll: 0, spin: 0, scale: 1, flash: 0 };
}

function hideMeshes(meshes: readonly (Mesh | null | undefined)[]) {
  for (const mesh of meshes) {
    if (mesh) {
      mesh.visible = false;
    }
  }
}

function ArenaPermanentMeshView({
  id,
  card,
  field,
  cache,
  motions,
  colors,
  activeSide,
  projectionCamera,
  reducedMotion,
}: Props) {
  const top = useRef<Mesh | null>(null);
  const sources = useRef<(Mesh | null)[]>([]);
  const links = useRef<(Mesh | null)[]>([]);
  const shadow = useRef<Mesh>(null);
  const glow = useRef<Mesh>(null);
  const aura = useRef(0);
  const motion = useMemo(createSample, []);
  const anchor = useMemo(() => new Vector3(), []);
  const shadowMaterial = useMemo(buildArenaCardShadowMaterial, []);
  const glowMaterial = useMemo(buildArenaCardGlowMaterial, []);
  const frameColors = useMemo(
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
    const tracked = field.permanents.get(id);
    const all = [top.current, ...sources.current, ...links.current, shadow.current, glow.current];
    if (!tracked || tracked.hidden || !top.current) {
      hideMeshes(all);
      return;
    }
    const time = state.clock.elapsedTime;
    motions.sample(id, time, motion);
    const look = applyArenaCardCue({
      sample: motion,
      permanentId: id,
      state: tracked.cues,
      focus: field.focus,
      time,
      reducedMotion,
    });
    const layers = Math.max(card.sourceUrls.length, 0) + card.linkUrls.length;
    const topHeight = CARD_FLOOR_HEIGHT + (layers + 1) * LAYER_STEP;
    const frameColor = frameColors[tracked.side];
    sources.current.forEach((mesh, index) => {
      const pose = tracked.sources[index];
      if (!mesh || !pose) {
        hideMeshes([mesh]);
        return;
      }
      placeArenaCardMesh({
        mesh,
        pose,
        motion,
        height: CARD_FLOOR_HEIGHT + (card.sourceUrls.length - index) * LAYER_STEP,
      });
      const material = mesh.material as ShaderMaterial;
      material.uniforms.uShade!.value = SOURCE_SHADE * tracked.opacity * look.shade;
      material.uniforms.uFrameColor!.value.copy(frameColor);
      material.uniforms.uFrameStrength!.value = SOURCE_FRAME_STRENGTH;
    });
    links.current.forEach((mesh, index) => {
      const pose = tracked.links[index];
      if (!mesh || !pose) {
        hideMeshes([mesh]);
        return;
      }
      placeArenaCardMesh({ mesh, pose, motion, height: CARD_FLOOR_HEIGHT + (index + 1) * LAYER_STEP * 0.5 });
    });
    placeArenaCardMesh({ mesh: top.current, pose: tracked.top, motion, height: topHeight });
    followArenaProxy({
      slot: tracked.slot,
      camera: projectionCamera,
      size: state.size,
      anchor: anchor.set(tracked.target.x, CARD_FLOOR_HEIGHT, tracked.target.z),
      rendered: top.current.position,
    });
    const topMaterial = top.current.material as ShaderMaterial;
    const shade = 0.45 + 0.55 * Math.min(1, Math.max(0, tracked.opacity));
    topMaterial.uniforms.uShade!.value = shade * look.shade;
    topMaterial.uniforms.uFlash!.value = motion.flash;
    topMaterial.uniforms.uFrameColor!.value.copy(frameColor);
    topMaterial.uniforms.uFrameStrength!.value = TOP_FRAME_STRENGTH;
    topMaterial.uniforms.uTime!.value = time;
    topMaterial.uniforms.uMaterialize!.value = look.materialize;
    const rimStrength = tracked.rim?.strength ?? 0;
    if (look.tintColor && look.tintStrength > rimStrength) {
      topMaterial.uniforms.uRimStrength!.value = look.tintStrength;
      topMaterial.uniforms.uRimColor!.value.set(look.tintColor);
    } else {
      topMaterial.uniforms.uRimStrength!.value = rimStrength;
      if (tracked.rim) {
        topMaterial.uniforms.uRimColor!.value.set(tracked.rim.color);
      }
    }
    if (shadow.current) {
      const lift = Math.max(0, motion.lift);
      shadow.current.visible = true;
      shadow.current.position.set(
        tracked.top.x + motion.offsetX * 0.7,
        0.012,
        tracked.top.z + motion.offsetZ * 0.7 + lift * 0.25,
      );
      shadow.current.rotation.set(0, tracked.top.yaw + motion.spin, 0);
      shadow.current.scale.setScalar(tracked.top.width * (1 + lift * 0.18));
      shadowMaterial.uniforms.uStrength!.value = 0.62 / (1 + lift * 1.4);
      shadowMaterial.uniforms.uSpread!.value = Math.min(1, lift * 0.5);
    }
    const auraTarget = getArenaAuraTarget({ side: tracked.side, activeSide, time, reducedMotion });
    aura.current += (auraTarget - aura.current) * Math.min(1, delta * 1.5);
    if (glow.current) {
      placeArenaCardMesh({ mesh: glow.current, pose: tracked.top, motion, height: topHeight - LAYER_STEP * 0.5 });
      applyArenaCardGlow({
        material: glowMaterial,
        rim: tracked.rim,
        auraColor: frameColor,
        aura: aura.current * Math.min(1, Math.max(0, tracked.opacity)) * look.shade,
        time,
      });
    }
  });

  return (
    <group>
      <mesh
        ref={shadow}
        geometry={ARENA_CARD_SHADOW_GEOMETRY}
        material={shadowMaterial}
        renderOrder={-1}
        visible={false}
      />
      {card.sourceUrls.map((urls, index) => (
        <ArenaCardFace
          key={`source-${index}`}
          urls={urls}
          cache={cache}
          registerMesh={(mesh) => {
            sources.current[index] = mesh;
          }}
        />
      ))}
      {card.linkUrls.map((urls, index) => (
        <ArenaCardFace
          key={`link-${index}`}
          urls={urls}
          cache={cache}
          registerMesh={(mesh) => {
            links.current[index] = mesh;
          }}
        />
      ))}
      <ArenaCardFace
        urls={card.topUrls}
        cache={cache}
        registerMesh={(mesh) => {
          top.current = mesh;
        }}
      />
      <mesh ref={glow} geometry={ARENA_CARD_GLOW_GEOMETRY} material={glowMaterial} visible={false} />
    </group>
  );
}

export const ArenaPermanentMesh = memo(ArenaPermanentMeshView);
