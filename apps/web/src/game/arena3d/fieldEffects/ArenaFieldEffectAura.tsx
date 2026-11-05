import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, NormalBlending, type Mesh, type ShaderMaterial } from "three";
import type { ArenaSideColors } from "@/game/arena3d/ArenaSideColors";
import type { ArenaLayoutVariantEntry } from "@/game/arena3d/field/ArenaLayoutVariant";
import type { ArenaLaneLayout } from "@/game/arena3d/field/arenaWorldLayout";
import { buildFieldEffectAuraMaterial } from "@/game/arena3d/fieldEffects/buildFieldEffectAuraMaterial";
import { findArenaFieldEffectArrival } from "@/game/arena3d/fieldEffects/findArenaFieldEffectArrival";
import { getArenaFieldEffectArrivalProgress } from "@/game/arena3d/fieldEffects/getArenaFieldEffectArrivalProgress";
import { getArenaFieldEffectArrivalStrength } from "@/game/arena3d/fieldEffects/getArenaFieldEffectArrivalStrength";
import { stepArenaFieldEffectWeight } from "@/game/arena3d/fieldEffects/stepArenaFieldEffectWeight";
import type { Arena3dQualityEntry } from "@/game/arena3d/quality/Arena3dQuality";
import type { ArenaFieldEffectMark } from "@/game/arena3d/slots/ArenaFieldEffectMark";
import type { ArenaFieldEffectState } from "@/game/arena3d/slots/ArenaFieldEffectState";
import { ArenaFieldEffectTone } from "@/game/arena3d/slots/ArenaFieldEffectTone";
import { findArenaFieldEffectTone } from "@/game/arena3d/slots/findArenaFieldEffectTone";
import { measureArenaSlotGrid } from "@/game/arena3d/slots/measureArenaSlotGrid";
import { Side } from "@/game/side";

type Props = {
  colors: ArenaSideColors;
  layout: ArenaLayoutVariantEntry;
  lanes: ArenaLaneLayout;
  fieldEffects: Readonly<Record<Side, ArenaFieldEffectState>>;
  quality: Arena3dQualityEntry;
  reducedMotion: boolean;
};

type SideTrack = {
  material: ShaderMaterial;
  mesh: { current: Mesh | null };
  marks: readonly ArenaFieldEffectMark[] | undefined;
  tone: ArenaFieldEffectTone;
  arrival: ArenaFieldEffectTone;
  arrivalPending: boolean;
  arrivalStartedAt: number;
};

type ToneColorParams = {
  material: ShaderMaterial;
  colorUniform: "uColor" | "uArrivalColor";
  tone: ArenaFieldEffectTone;
  isLight: boolean;
};

const LAYER_HEIGHT = 0.008;
const FRAME_MARGIN = 0.18;
const PLANE_MARGIN = 1.6;
const VISIBLE_WEIGHT = 0.001;
const SIDES = [Side.Viewer, Side.Opponent] as const;

function applyToneColor({ material, colorUniform, tone, isLight }: ToneColorParams): void {
  const entry = findArenaFieldEffectTone(tone);
  material.uniforms[colorUniform]!.value.set(isLight ? entry.lightColor : entry.color);
  material.uniforms[colorUniform === "uColor" ? "uHarmful" : "uArrivalHarmful"]!.value = entry.isHarmful ? 1 : 0;
}

function createSideTrack(facing: number): SideTrack {
  return {
    material: buildFieldEffectAuraMaterial(facing),
    mesh: { current: null },
    marks: undefined,
    tone: ArenaFieldEffectTone.NONE.value,
    arrival: ArenaFieldEffectTone.NONE.value,
    arrivalPending: false,
    arrivalStartedAt: -100,
  };
}

export function ArenaFieldEffectAura({ colors, layout, lanes, fieldEffects, quality, reducedMotion }: Props) {
  const tracks = useMemo<Record<Side, SideTrack>>(
    () => ({ [Side.Viewer]: createSideTrack(1), [Side.Opponent]: createSideTrack(-1) }),
    [],
  );
  const grid = measureArenaSlotGrid(lanes);
  const planeWidth = (grid.halfWidth + FRAME_MARGIN + PLANE_MARGIN) * 2;
  const planeDepth = (grid.halfDepth + FRAME_MARGIN + PLANE_MARGIN) * 2;

  useEffect(
    () => () => {
      for (const side of SIDES) {
        tracks[side].material.dispose();
      }
    },
    [tracks],
  );

  useEffect(() => {
    for (const side of SIDES) {
      const track = tracks[side];
      const next = fieldEffects[side];
      if (track.marks && !reducedMotion) {
        const arrival = findArenaFieldEffectArrival({ previous: track.marks, next: next.marks });
        if (arrival !== ArenaFieldEffectTone.NONE.value) {
          track.arrival = arrival;
          track.arrivalPending = true;
        }
      }
      track.marks = next.marks;
      if (next.tone !== ArenaFieldEffectTone.NONE.value) {
        track.tone = next.tone;
      }
    }
  }, [tracks, fieldEffects, reducedMotion]);

  useEffect(() => {
    for (const side of SIDES) {
      const { material, tone, arrival } = tracks[side];
      applyToneColor({ material, colorUniform: "uColor", tone, isLight: colors.isLight });
      applyToneColor({ material, colorUniform: "uArrivalColor", tone: arrival, isLight: colors.isLight });
      material.uniforms.uLight!.value = colors.isLight ? 1 : 0;
      material.blending =
        colors.isLight || findArenaFieldEffectTone(tone).isHarmful ? NormalBlending : AdditiveBlending;
      material.needsUpdate = true;
    }
  }, [tracks, fieldEffects, colors.isLight]);

  useEffect(() => {
    for (const side of SIDES) {
      const uniforms = tracks[side].material.uniforms;
      uniforms.uHalfSize!.value.set(grid.halfWidth + FRAME_MARGIN, grid.halfDepth + FRAME_MARGIN);
      uniforms.uCenterDepth!.value = grid.centerDepth;
      uniforms.uScreenFade!.value.x = layout.aura.screenFadeX;
      uniforms.uEnergy!.value = quality.floorEnergy ? 1 : 0;
      uniforms.uFlow!.value = reducedMotion ? 0 : 1;
    }
  }, [
    tracks,
    grid.halfWidth,
    grid.halfDepth,
    grid.centerDepth,
    layout.aura.screenFadeX,
    quality.floorEnergy,
    reducedMotion,
  ]);

  useFrame((state, rawDelta) => {
    const delta = reducedMotion ? 1 : Math.min(rawDelta, 1 / 15);
    const time = state.clock.elapsedTime;
    for (const side of SIDES) {
      const track = tracks[side];
      const uniforms = track.material.uniforms;
      if (track.arrivalPending) {
        track.arrivalPending = false;
        track.arrivalStartedAt = time;
      }
      const age = time - track.arrivalStartedAt;
      uniforms.uTime!.value = time;
      uniforms.uArrival!.value = reducedMotion ? 0 : getArenaFieldEffectArrivalStrength(age);
      uniforms.uArrivalProgress!.value = getArenaFieldEffectArrivalProgress(age);
      uniforms.uWeight!.value = stepArenaFieldEffectWeight({
        current: uniforms.uWeight!.value,
        active: fieldEffects[side].tone !== ArenaFieldEffectTone.NONE.value,
        delta,
      });
      const mesh = track.mesh.current;
      if (mesh) {
        mesh.visible = uniforms.uWeight!.value > VISIBLE_WEIGHT || uniforms.uArrival!.value > 0;
      }
    }
  });

  return (
    <>
      {SIDES.map((side) => (
        <mesh
          key={side}
          ref={(mesh) => {
            tracks[side].mesh.current = mesh;
          }}
          rotation-x={-Math.PI / 2}
          position={[0, LAYER_HEIGHT, side === Side.Viewer ? grid.centerDepth : -grid.centerDepth]}
          scale={[planeWidth, planeDepth, 1]}
          material={tracks[side].material}
          renderOrder={-4}
          frustumCulled={false}
          visible={false}
        >
          <planeGeometry />
        </mesh>
      ))}
    </>
  );
}
