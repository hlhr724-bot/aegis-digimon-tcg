import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { ImageLoader, SRGBColorSpace, TextureLoader, HalfFloatType, PCFShadowMap, Vector3 } from "three";
import type { PackCard } from "@/packOpening/PackCard";
import type { CarouselState } from "@/packOpening/carousel/createCarouselState";
import { CardFinish } from "@/packOpening/CardFinish";
import { getCardFinish } from "@/packOpening/getCardFinish";
import { getPackCardKey } from "@/packOpening/getPackCardKey";
import { findBestPull } from "@/packOpening/findBestPull";
import { findPackOpeningPhase } from "@/packOpening/findPackOpeningPhase";
import { findPackRarity } from "@/packOpening/findPackRarity";
import { PackOpeningPhase } from "@/packOpening/PackOpeningPhase";
import { PackRarity } from "@/packOpening/PackRarity";
import { BoosterPack } from "@/packOpening/scene/BoosterPack";
import { buildPackWrapperTextures } from "@/packOpening/scene/buildPackWrapperTextures";
import { CardGripControls } from "@/packOpening/scene/CardGripControls";
import { createCardGrip, type CardGrip } from "@/packOpening/scene/createCardGrip";
import { CarouselDriver } from "@/packOpening/scene/CarouselDriver";
import { getCardRevealState } from "@/packOpening/scene/getCardRevealState";
import { getStageLayout, type StageLayout } from "@/packOpening/scene/getStageLayout";
import { PackStudioLighting } from "@/packOpening/scene/PackStudioLighting";
import { NeonGrid } from "@/packOpening/scene/NeonGrid";
import { OpeningEffects } from "@/packOpening/scene/OpeningEffects";
import { RevealedCard } from "@/packOpening/scene/RevealedCard";
import { useCardTextures } from "@/packOpening/scene/useCardTextures";

type Props = {
  playbackRate: number;
  setId: string;
  coverUrl: string;
  cards: readonly PackCard[];
  phase: PackOpeningPhase;
  packCount: number;
  showPacks: boolean;
  carousel: RefObject<CarouselState>;
  selectedPack: number | undefined;
  revealedCount: number;
  reducedMotion: boolean;
  foilEnabled: boolean;
  onPhaseComplete: (next: PackOpeningPhase) => void;
  onActivatePack: (index: number) => void;
  onRevealNext: () => void;
  inspectedIndex: number | undefined;
  onInspectCard: (index: number) => void;
  onClearInspection: () => void;
};

interface CameraImpulse {
  strength: number;
  startedAt: number;
}

const CARD_BACK_URL = "/sleeves/digimon-standard.webp";
const DEFAULT_HIT_COLOR = "#5ff0ff";
const REDUCED_MOTION_TIME_SCALE = 0.3;
const SHAKE_SECONDS = 0.55;

useLoader.preload(TextureLoader, CARD_BACK_URL);

type DirectorProps = {
  playbackRate: number;
  phase: PackOpeningPhase;
  phaseStartedAt: RefObject<number>;
  reducedMotion: boolean;
  onPhaseComplete: (next: PackOpeningPhase) => void;
};

function PhaseDirector({ phase, phaseStartedAt, reducedMotion, onPhaseComplete, playbackRate }: DirectorProps) {
  const clock = useThree((state) => state.clock);
  const completed = useRef(false);

  useLayoutEffect(() => {
    phaseStartedAt.current = clock.elapsedTime;
    completed.current = false;
  }, [phase, clock, phaseStartedAt]);

  useFrame((state) => {
    const entry = findPackOpeningPhase(phase);
    if (completed.current || entry.durationSeconds === undefined || !entry.next) {
      return;
    }
    const duration = (entry.durationSeconds * (reducedMotion ? REDUCED_MOTION_TIME_SCALE : 1)) / playbackRate;
    if (state.clock.elapsedTime - (phaseStartedAt.current ?? 0) >= duration) {
      completed.current = true;
      onPhaseComplete(entry.next);
    }
  });

  return null;
}

function isCoarsePointer(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

type CameraProps = {
  layout: StageLayout;
  phase: PackOpeningPhase;
  phaseStartedAt: RefObject<number>;
  impulse: RefObject<CameraImpulse>;
  reducedMotion: boolean;
};

type DollyParams = {
  phase: PackOpeningPhase;
  elapsed: number;
};

function getDollyAmount({ phase, elapsed }: DollyParams): number {
  if (phase === PackOpeningPhase.CHARGING.value) {
    const charge = clampUnit(elapsed / PackOpeningPhase.CHARGING.durationSeconds);
    return charge * charge;
  }
  if (phase === PackOpeningPhase.BURST.value) {
    return 1 - clampUnit(elapsed / 0.9);
  }
  return 0;
}

function CameraRig({ layout, phase, phaseStartedAt, impulse, reducedMotion }: CameraProps) {
  const camera = useThree((state) => state.camera);
  const parallax = useMemo(() => !isCoarsePointer(), []);
  const pointer = useRef({ x: 0, y: 0 });
  const desired = useMemo(() => new Vector3(), []);

  useEffect(() => {
    camera.position.set(...layout.cameraPosition);
    camera.lookAt(...layout.cameraTarget);
  }, [camera, layout]);

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 20);
    const time = state.clock.elapsedTime;
    const motion = reducedMotion ? 0 : 1;
    const ease = Math.min(1, delta * 2.5);
    pointer.current.x += ((parallax ? state.pointer.x : 0) - pointer.current.x) * ease;
    pointer.current.y += ((parallax ? state.pointer.y : 0) - pointer.current.y) * ease;
    const dolly = getDollyAmount({ phase, elapsed: time - (phaseStartedAt.current ?? 0) }) * motion;
    const drift = Math.sin(time * 0.25) * 0.12 * motion;
    desired.set(
      layout.cameraPosition[0] + drift + pointer.current.x * 0.18,
      layout.cameraPosition[1] + pointer.current.y * 0.1 - dolly * 0.25,
      layout.cameraPosition[2] - dolly * 1.8,
    );
    camera.position.lerp(desired, Math.min(1, delta * 4));
    const shakeAge = time - impulse.current.startedAt;
    if (motion && shakeAge >= 0 && shakeAge < SHAKE_SECONDS) {
      const strength = impulse.current.strength * (1 - shakeAge / SHAKE_SECONDS) ** 2;
      camera.position.x += Math.sin(time * 83) * strength;
      camera.position.y += Math.sin(time * 67 + 1.3) * strength * 0.8;
    }
    camera.lookAt(...layout.cameraTarget);
  });

  return null;
}

type PacksProps = Pick<
  Props,
  | "playbackRate"
  | "setId"
  | "coverUrl"
  | "phase"
  | "packCount"
  | "carousel"
  | "selectedPack"
  | "reducedMotion"
  | "onActivatePack"
> & {
  layout: StageLayout;
  phaseStartedAt: RefObject<number>;
  hitColor: string;
};

function PackCarousel({
  playbackRate,
  setId,
  coverUrl,
  layout,
  phase,
  packCount,
  carousel,
  phaseStartedAt,
  selectedPack,
  hitColor,
  reducedMotion,
  onActivatePack,
}: PacksProps) {
  const cover = useLoader(ImageLoader, coverUrl);
  const textures = useMemo(() => buildPackWrapperTextures({ cover, setId }), [cover, setId]);
  useEffect(
    () => () => {
      for (const texture of Object.values(textures)) {
        texture.dispose();
      }
    },
    [textures],
  );
  return (
    <>
      {Array.from({ length: packCount }, (_, index) => (
        <BoosterPack
          key={`${setId}-${index}`}
          playbackRate={playbackRate}
          index={index}
          count={packCount}
          textures={textures}
          layout={layout}
          carousel={carousel}
          phase={phase}
          phaseStartedAt={phaseStartedAt}
          selected={selectedPack === index}
          hitColor={hitColor}
          reducedMotion={reducedMotion}
          onActivate={onActivatePack}
        />
      ))}
    </>
  );
}

type CardsProps = Pick<
  Props,
  | "playbackRate"
  | "cards"
  | "phase"
  | "revealedCount"
  | "reducedMotion"
  | "onRevealNext"
  | "onInspectCard"
  | "inspectedIndex"
  | "foilEnabled"
> & {
  layout: StageLayout;
  phaseStartedAt: RefObject<number>;
  grip: CardGrip;
};

function CardSpread({
  playbackRate,
  cards,
  phase,
  revealedCount,
  layout,
  phaseStartedAt,
  reducedMotion,
  onRevealNext,
  onInspectCard,
  inspectedIndex,
  foilEnabled,
  grip,
}: CardsProps) {
  const back = useLoader(TextureLoader, CARD_BACK_URL);
  const tiltWithPointer = useMemo(() => !isCoarsePointer(), []);
  back.colorSpace = SRGBColorSpace;
  const fronts = useCardTextures(cards);
  return (
    <>
      {cards.map((card, index) => (
        <RevealedCard
          key={`${getPackCardKey(card)}-${index}`}
          index={index}
          playbackRate={playbackRate}
          inspected={inspectedIndex === index}
          dimmed={inspectedIndex !== undefined && inspectedIndex !== index}
          cardCount={cards.length}
          revealState={getCardRevealState({ index, revealedCount, phase })}
          nextToReveal={index === revealedCount}
          front={fronts.get(getPackCardKey(card))}
          back={back}
          finish={getCardFinish(card)}
          glowColor={card.artId ? PackRarity.SECRET_RARE.glowColor : findPackRarity(card.rarity)?.glowColor}
          spawnPosition={layout.chargePosition}
          stackPosition={layout.stackPosition}
          focusPosition={layout.focusPosition}
          focusScale={layout.focusScale}
          inspectPosition={layout.inspectPosition}
          inspectScale={layout.inspectScale}
          slotPosition={layout.cardSlots[index] ?? layout.stackPosition}
          slotScale={layout.cardScale}
          phaseStartedAt={phaseStartedAt}
          reducedMotion={reducedMotion}
          tiltWithPointer={tiltWithPointer}
          foilEnabled={foilEnabled}
          grip={grip}
          onActivate={() => {
            if (inspectedIndex !== undefined && inspectedIndex !== index) {
              return;
            }
            if (
              phase === PackOpeningPhase.SUMMARY.value ||
              (phase === PackOpeningPhase.REVEALING.value && index < revealedCount)
            ) {
              onInspectCard(index);
              return;
            }
            onRevealNext();
          }}
        />
      ))}
    </>
  );
}

function getHitColor(cards: readonly PackCard[]): string {
  const bestCard = findBestPull(cards);
  if (bestCard?.artId) {
    return PackRarity.SECRET_RARE.glowColor;
  }
  const best = findPackRarity(bestCard?.rarity);
  if (!best?.glowColor || best.value === PackRarity.RARE.value) {
    return DEFAULT_HIT_COLOR;
  }
  return best.glowColor;
}

type GlowParams = {
  cards: readonly PackCard[];
  phase: PackOpeningPhase;
  revealedCount: number;
};

function getFocusedGlow({ cards, phase, revealedCount }: GlowParams): string | undefined {
  if (phase !== PackOpeningPhase.REVEALING.value) {
    return undefined;
  }
  const card = cards[revealedCount - 1];
  return card?.artId ? PackRarity.SECRET_RARE.glowColor : findPackRarity(card?.rarity)?.glowColor;
}

type StageProps = Props & {
  grip: CardGrip;
};

function StageContents(props: StageProps) {
  const { cards, phase, carousel, packCount, revealedCount, reducedMotion, onPhaseComplete } = props;
  const phaseStartedAt = useRef(0);
  const impulse = useRef<CameraImpulse>({ strength: 0, startedAt: -10 });
  const clock = useThree((state) => state.clock);
  const size = useThree((state) => state.size);
  const layout = useMemo(
    () => getStageLayout({ aspect: size.width / Math.max(1, size.height), cardCount: Math.max(cards.length, 12) }),
    [size.width, size.height, cards.length],
  );
  const focusedGlow = getFocusedGlow({ cards, phase, revealedCount });
  const hitColor = getHitColor(cards);
  const prismaticHit = getCardFinish(findBestPull(cards)).value === CardFinish.PRISMATIC.value;
  const charged = phase === PackOpeningPhase.CHARGING.value || phase === PackOpeningPhase.BURST.value;
  const energy = charged || focusedGlow ? 1 : 0;

  useEffect(() => {
    if (phase === PackOpeningPhase.BURST.value) {
      impulse.current = { strength: 0.22, startedAt: clock.elapsedTime };
    }
  }, [phase, clock]);

  useEffect(() => {
    if (focusedGlow) {
      impulse.current = { strength: 0.08, startedAt: clock.elapsedTime + 0.35 };
    }
  }, [focusedGlow, revealedCount, clock]);

  return (
    <>
      <color attach="background" args={["#020409"]} />
      <fog attach="fog" args={["#020409", 9, 26]} />
      <PackStudioLighting />
      <CameraRig
        layout={layout}
        phase={phase}
        phaseStartedAt={phaseStartedAt}
        impulse={impulse}
        reducedMotion={reducedMotion}
      />
      <CarouselDriver carousel={carousel} count={packCount} />
      <CardGripControls
        grip={props.grip}
        inspectedIndex={props.inspectedIndex}
        inspectDepth={layout.inspectPosition[2]}
        inspectScale={layout.inspectScale}
      />
      <PhaseDirector
        playbackRate={props.playbackRate}
        phase={phase}
        phaseStartedAt={phaseStartedAt}
        reducedMotion={reducedMotion}
        onPhaseComplete={onPhaseComplete}
      />
      <NeonGrid energy={energy} reducedMotion={reducedMotion} />
      {props.showPacks ? (
        <Suspense fallback={null}>
          <PackCarousel {...props} layout={layout} phaseStartedAt={phaseStartedAt} hitColor={hitColor} />
        </Suspense>
      ) : null}
      <OpeningEffects
        playbackRate={props.playbackRate}
        phase={phase}
        phaseStartedAt={phaseStartedAt}
        chargePosition={layout.chargePosition}
        hitColor={hitColor}
        prismatic={prismaticHit}
        reducedMotion={reducedMotion}
      />
      {cards.length > 0 ? (
        <Suspense fallback={null}>
          <CardSpread {...props} layout={layout} phaseStartedAt={phaseStartedAt} />
        </Suspense>
      ) : null}
      <EffectComposer frameBufferType={HalfFloatType}>
        <Bloom mipmapBlur luminanceThreshold={1.15} luminanceSmoothing={0.2} intensity={0.45} radius={0.7} />
        <Vignette offset={0.25} darkness={0.4} />
      </EffectComposer>
    </>
  );
}

export function PackOpeningScene(props: Props) {
  const { phase, onRevealNext, inspectedIndex, onClearInspection } = props;
  const grip = useMemo(createCardGrip, []);
  return (
    <Canvas
      className="pack-opening__canvas"
      shadows={{ type: PCFShadowMap }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: false }}
      camera={{ fov: 40, near: 0.1, far: 60, position: [0, 2.1, 9] }}
      onPointerMissed={() => {
        if (grip.dragged) {
          grip.dragged = false;
          return;
        }
        if (inspectedIndex !== undefined) {
          onClearInspection();
          return;
        }
        if (phase === PackOpeningPhase.REVEALING.value) {
          onRevealNext();
        }
      }}
    >
      <StageContents {...props} grip={grip} />
    </Canvas>
  );
}
