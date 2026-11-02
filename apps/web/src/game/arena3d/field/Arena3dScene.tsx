import { memo, useEffect, useMemo, useRef, useSyncExternalStore, type ComponentType, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { PerspectiveCamera, Vector3 } from "three";
import { Side } from "@/game/side";
import { createCardTextureCache } from "@/design/webglCard/createCardTextureCache";
import type { ArenaActivity } from "@/game/arena3d/ArenaActivity";
import { ArenaActiveSideAura } from "@/game/arena3d/ArenaActiveSideAura";
import { ArenaAuroraEnvironment } from "@/game/arena3d/ArenaAuroraEnvironment";
import type { ArenaCameraImpulse } from "@/game/arena3d/ArenaCameraImpulse";
import { ArenaEnvironment } from "@/game/arena3d/ArenaEnvironment";
import type { ArenaEnvironmentSceneProps } from "@/game/arena3d/ArenaEnvironmentSceneProps";
import { ArenaFrameDriver } from "@/game/arena3d/ArenaFrameDriver";
import { ArenaGridEnvironment } from "@/game/arena3d/ArenaGridEnvironment";
import { ArenaHaloEnvironment } from "@/game/arena3d/ArenaHaloEnvironment";
import { ArenaHologramEnvironment } from "@/game/arena3d/ArenaHologramEnvironment";
import { ArenaPrismEnvironment } from "@/game/arena3d/ArenaPrismEnvironment";
import type { ArenaPulse } from "@/game/arena3d/ArenaPulse";
import { ArenaPulseLayer } from "@/game/arena3d/ArenaPulseLayer";
import { ArenaBreedingFocus } from "@/game/arena3d/breeding/ArenaBreedingFocus";
import { ArenaCardCueLayer } from "@/game/arena3d/cues/ArenaCardCueLayer";
import { ArenaCardDepartures } from "@/game/arena3d/cues/ArenaCardDepartures";
import type { DeleteBurst } from "@/game/match/types";
import type { ArenaSideColors } from "@/game/arena3d/ArenaSideColors";
import { CAMERA_FOV_DEGREES } from "@/game/arena3d/arenaSceneLayout";
import { createArenaRippleBuffer } from "@/game/arena3d/createArenaRippleBuffer";
import { ArenaMotionDirector } from "@/game/arena3d/effects/ArenaMotionDirector";
import { ArenaPostEffects } from "@/game/arena3d/effects/ArenaPostEffects";
import { ArenaShaderWarmup } from "@/game/arena3d/effects/ArenaShaderWarmup";
import { createArenaCardMotionRegistry } from "@/game/arena3d/effects/createArenaCardMotionRegistry";
import { Arena3dCameraRig } from "@/game/arena3d/field/Arena3dCameraRig";
import type { ArenaCameraBase } from "@/game/arena3d/field/ArenaCameraBase";
import { ArenaLayoutSync } from "@/game/arena3d/field/ArenaLayoutSync";
import type { ArenaFieldStore } from "@/game/arena3d/field/createArenaFieldStore";
import { ArenaLayoutVariant } from "@/game/arena3d/field/ArenaLayoutVariant";
import { createArenaFrameCamera } from "@/game/arena3d/field/createArenaFrameCamera";
import type { ArenaFieldCard, ArenaZoneCard } from "@/game/arena3d/field/ArenaFieldCard";
import { createArenaTrackedField } from "@/game/arena3d/field/createArenaTrackedField";
import { skipUnchangedPixelRatio } from "@/game/arena3d/field/skipUnchangedPixelRatio";
import { ArenaPermanentMesh } from "@/game/arena3d/meshes/ArenaPermanentMesh";
import { ArenaMemoryTrack } from "@/game/arena3d/memory/ArenaMemoryTrack";
import { ArenaZoneMesh } from "@/game/arena3d/meshes/ArenaZoneMesh";
import type { Arena3dQualityEntry } from "@/game/arena3d/quality/Arena3dQuality";
import { ArenaQualityGovernor } from "@/game/arena3d/quality/ArenaQualityGovernor";
import type { ArenaFieldEffectState } from "@/game/arena3d/slots/ArenaFieldEffectState";
import { ArenaSlotTiles } from "@/game/arena3d/slots/ArenaSlotTiles";

type Props = {
  board: RefObject<HTMLElement | null>;
  store: ArenaFieldStore;
  environment: ArenaEnvironment;
  colors: ArenaSideColors;
  pulses: readonly ArenaPulse[];
  activeSide: number;
  artSrc: string | undefined;
  reducedMotion: boolean;
  quality: Arena3dQualityEntry;
  automaticQuality: boolean;
  cards: ReadonlyMap<string, ArenaFieldCard>;
  zones: ReadonlyMap<string, ArenaZoneCard>;
  breedingPermanents: ReadonlyMap<string, string>;
  deleteBursts: readonly DeleteBurst[];
  backUrl: string;
  memory: number;
  memoryPrediction: number | undefined;
  fieldEffects: Readonly<Record<Side, ArenaFieldEffectState>>;
  breedingFocus: boolean;
  onDowngrade: () => void;
  onContextLost: () => void;
};

type EnergyProps = {
  energy: { current: number };
};

const ENVIRONMENT_SCENES: Record<ArenaEnvironment, ComponentType<ArenaEnvironmentSceneProps>> = {
  [ArenaEnvironment.HOLOGRAM.value]: ArenaHologramEnvironment,
  [ArenaEnvironment.PRISM.value]: ArenaPrismEnvironment,
  [ArenaEnvironment.GRID.value]: ArenaGridEnvironment,
  [ArenaEnvironment.HALO.value]: ArenaHaloEnvironment,
  [ArenaEnvironment.AURORA.value]: ArenaAuroraEnvironment,
};

function EnergyDecay({ energy }: EnergyProps) {
  useFrame((_, delta) => {
    energy.current = Math.max(0, energy.current - delta * 0.8);
  });
  return null;
}

function ArenaSceneContents(props: Props) {
  const { board, environment, colors, pulses, activeSide, artSrc, reducedMotion, quality, cards, zones } = props;
  const field = useMemo(createArenaTrackedField, []);
  const snapshot = useSyncExternalStore(props.store.subscribe, props.store.get);
  const frame = snapshot.frame;
  const layout = frame?.layout ?? ArenaLayoutVariant.WIDE;
  const referenceCamera = useMemo(
    () => (frame ? createArenaFrameCamera(frame) : new PerspectiveCamera(CAMERA_FOV_DEGREES, 1, 0.1, 200)),
    [frame],
  );
  const cameraBase = useMemo<ArenaCameraBase>(
    () => ({
      position: frame ? new Vector3(...frame.position) : new Vector3(0, 15, 8),
      target: frame ? new Vector3(...frame.target) : new Vector3(),
    }),
    [frame],
  );
  const permanentIds = [
    ...[...snapshot.rows[Side.Viewer], ...snapshot.rows[Side.Opponent]].map((slot) => slot.permanent.permanentId),
    ...[...props.breedingPermanents].filter(([zoneKey]) => snapshot.zones.has(zoneKey)).map(([, id]) => id),
  ];
  const zoneKeys = [...snapshot.zones.keys()];
  const cache = useMemo(
    () => createCardTextureCache({ width: quality.textureWidth, budgetBytes: quality.textureBudgetBytes }),
    [quality.textureWidth, quality.textureBudgetBytes],
  );
  const motions = useMemo(createArenaCardMotionRegistry, []);
  const ripples = useMemo(createArenaRippleBuffer, []);
  const impulse = useRef<ArenaCameraImpulse>({ strength: 0, startedAt: -100 });
  const energy = useRef(0);
  const activity = useRef<ArenaActivity>({
    busyUntil: 0,
    pacedUntil: 0,
    frameRateCap: Number.POSITIVE_INFINITY,
    renderedFrames: 0,
    lateFrames: 0,
  });
  const EnvironmentScene = ENVIRONMENT_SCENES[environment];

  useEffect(() => () => cache.dispose(), [cache]);

  return (
    <>
      <ArenaLayoutSync
        board={board}
        store={props.store}
        field={field}
        breedingPermanents={props.breedingPermanents}
        projectionCamera={referenceCamera}
        activity={activity}
        reducedMotion={reducedMotion}
      />
      <EnvironmentScene
        colors={colors}
        ripples={ripples}
        activeSide={activeSide}
        energy={energy}
        artSrc={artSrc}
        reducedMotion={reducedMotion}
        quality={quality}
      />
      <ArenaActiveSideAura
        colors={colors}
        layout={layout}
        activeSide={activeSide}
        quality={quality}
        reducedMotion={reducedMotion}
        pulses={pulses}
      />
      <ArenaSlotTiles
        rows={snapshot.rows}
        lanes={layout.lanes}
        field={field}
        colors={colors}
        activeSide={activeSide}
        fieldEffects={props.fieldEffects}
        reducedMotion={reducedMotion}
      />
      <ArenaMemoryTrack
        memory={props.memory}
        prediction={props.memoryPrediction}
        scale={layout.memoryScale}
        colors={colors}
        ripples={ripples}
        activity={activity}
        reducedMotion={reducedMotion}
      />
      {permanentIds.map((id) => {
        const card = cards.get(id);
        return card ? (
          <ArenaPermanentMesh
            key={id}
            id={id}
            card={card}
            field={field}
            cache={cache}
            motions={motions}
            colors={colors}
            activeSide={activeSide}
            projectionCamera={referenceCamera}
            reducedMotion={reducedMotion}
          />
        ) : null;
      })}
      {zoneKeys.map((key) => {
        const zone = zones.get(key);
        return zone ? (
          <ArenaZoneMesh
            key={key}
            zoneKey={key}
            zone={zone}
            field={field}
            cache={cache}
            colors={colors}
            activeSide={activeSide}
            reducedMotion={reducedMotion}
          />
        ) : null;
      })}
      <ArenaMotionDirector
        pulses={pulses}
        field={field}
        motions={motions}
        projectionCamera={referenceCamera}
        reducedMotion={reducedMotion}
      />
      <ArenaCardCueLayer field={field} isLight={colors.isLight} activity={activity} reducedMotion={reducedMotion} />
      <ArenaCardDepartures
        board={board}
        deleteBursts={props.deleteBursts}
        backUrl={props.backUrl}
        cache={cache}
        projectionCamera={referenceCamera}
        activity={activity}
        reducedMotion={reducedMotion}
      />
      <ArenaPulseLayer
        pulses={pulses}
        projectionCamera={referenceCamera}
        ripples={ripples}
        impulse={impulse}
        energy={energy}
        activity={activity}
        isLight={colors.isLight}
        shardCount={quality.shardCount}
        reducedMotion={reducedMotion}
      />
      <ArenaBreedingFocus
        active={props.breedingFocus}
        breedingPermanents={props.breedingPermanents}
        rimColor={colors.playerAccent}
        layout={layout}
        linearBlending={quality.bloom}
        activity={activity}
        reducedMotion={reducedMotion}
      />
      <Arena3dCameraRig base={cameraBase} impulse={impulse} store={props.store} reducedMotion={reducedMotion} />
      <EnergyDecay energy={energy} />
      <ArenaFrameDriver activity={activity} frameRate={quality.frameRate} reducedMotion={reducedMotion} />
      <ArenaQualityGovernor
        automatic={props.automaticQuality}
        canDowngrade={quality.rank > 0}
        frameRate={quality.frameRate}
        activity={activity}
        onDowngrade={props.onDowngrade}
        onContextLost={props.onContextLost}
      />
      {quality.bloom ? <ArenaPostEffects isLight={colors.isLight} /> : null}
      <ArenaShaderWarmup postProcessing={quality.bloom} />
    </>
  );
}

function Arena3dCanvas(props: Props) {
  const { quality } = props;
  return (
    <Canvas
      key={quality.antialias ? "smooth" : "sharp"}
      className="arena-3d-scene__canvas"
      dpr={[1, quality.maxDpr]}
      frameloop="never"
      resize={{ debounce: { scroll: 50, resize: 150 } }}
      gl={{ antialias: quality.antialias, alpha: false, powerPreference: "high-performance", stencil: false }}
      camera={{ fov: CAMERA_FOV_DEGREES, near: 0.1, far: 200, position: [0, 15, 8] }}
      onCreated={({ gl }) => skipUnchangedPixelRatio(gl)}
    >
      <ArenaSceneContents {...props} />
    </Canvas>
  );
}

export const Arena3dScene = memo(Arena3dCanvas);
