import { Suspense, useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import type { CardInstance, FieldEffectView, Permanent } from "@aegis/shared";
import { ClientErrorBoundary } from "@/clientErrors/ClientErrorBoundary";
import { REDUCED_MOTION_QUERY } from "@/design/motion/reducedMotionQuery";
import { useCardSleeve, useEggSleeve } from "@/design/sleeve";
import { useMediaQuery } from "@/design/useMediaQuery";
import type { ArenaEnvironment } from "@/game/arena3d/ArenaEnvironment";
import { ArenaZone } from "@/game/arena3d/ArenaZone";
import { Side } from "@/game/side";
import type { ArenaFieldStore } from "@/game/arena3d/field/createArenaFieldStore";
import { buildArenaFieldCards } from "@/game/arena3d/field/buildArenaFieldCards";
import { buildArenaZoneCards, type ArenaSideZones } from "@/game/arena3d/field/buildArenaZoneCards";
import { Arena3dNotice } from "@/game/arena3d/fallback/Arena3dNotice";
import { Arena3dSceneStatus } from "@/game/arena3d/fallback/Arena3dSceneStatus";
import { useArena3dSceneRecovery } from "@/game/arena3d/fallback/useArena3dSceneRecovery";
import { isWebGlAvailable } from "@/game/arena3d/isWebGlAvailable";
import type { Arena3dQuality } from "@/game/arena3d/quality/Arena3dQuality";
import { AUTO_ARENA_3D_QUALITY } from "@/game/arena3d/quality/Arena3dQualityChoice";
import { arena3dQualityPreference } from "@/game/arena3d/quality/arena3dQualityPreference";
import { probeArena3dQuality } from "@/game/arena3d/quality/probeArena3dQuality";
import { readArena3dDeviceClass } from "@/game/arena3d/quality/readArena3dDeviceClass";
import { readArena3dDeviceSignals } from "@/game/arena3d/quality/readArena3dDeviceSignals";
import { resolveArena3dQuality } from "@/game/arena3d/quality/resolveArena3dQuality";
import { useArenaPulses } from "@/game/arena3d/useArenaPulses";
import { useArenaSideColors } from "@/game/arena3d/useArenaSideColors";
import type { ArenaFieldEffectState } from "@/game/arena3d/slots/ArenaFieldEffectState";
import { summarizeArenaFieldEffects } from "@/game/arena3d/slots/summarizeArenaFieldEffects";
import type { FieldClashScene } from "@/game/fieldClash";
import type { DeleteBurst, TurnTransitionCue } from "@/game/match/types";
import type { MatchFinale } from "@/game/match/finale/MatchFinale";
import type { MatchFinaleTone } from "@/game/match/finale/MatchFinaleTone";
import type { PermanentBurst } from "@/game/showcases";
import type { AttackAnnouncement } from "@/game/sidePanels";
import { createLazyComponent } from "@/net/createLazyComponent";
import { useTranslation } from "@/i18n/useTranslation";
import "@/game/arena3d/cues/arena3dCueOverlay.css";

type Props = {
  board: RefObject<HTMLElement | null>;
  store: ArenaFieldStore;
  paletteKey: unknown;
  artSrc: string | undefined;
  environment: ArenaEnvironment;
  viewerSeat: number;
  displayedTurnSeat: number | undefined;
  memory: number;
  memoryPrediction: number | undefined;
  permanents: RefObject<Record<string, HTMLDivElement | null>>;
  attackAnnouncement: AttackAnnouncement | null;
  turnTransition: TurnTransitionCue | null;
  combatImpactIds: ReadonlySet<string>;
  permanentBursts: ReadonlyMap<string, PermanentBurst>;
  deleteBursts: readonly DeleteBurst[];
  securityHitSeat: number | null;
  finale: MatchFinale | null;
  finaleTone: MatchFinaleTone | undefined;
  fieldClash: FieldClashScene | null;
  viewerBattleArea: readonly Permanent[];
  opponentBattleArea: readonly Permanent[];
  opponentBreeding: Permanent | undefined;
  viewerBreeding: Permanent | undefined;
  viewerZones: ArenaSideZones;
  opponentZones: ArenaSideZones;
  viewerFieldEffects: readonly FieldEffectView[];
  opponentFieldEffects: readonly FieldEffectView[];
  breedingFocus: boolean;
};

const DEFAULT_SLEEVE = "/sleeves/digimon-standard.webp";

const Arena3dScene = createLazyComponent({
  load: () => import("@/game/arena3d/field/Arena3dScene"),
  pick: (module) => module.Arena3dScene,
});

function probeDeviceQuality(): Arena3dQuality | undefined {
  const signals = readArena3dDeviceSignals();
  return signals ? probeArena3dQuality(signals) : undefined;
}

function SceneCrashSignal({ onCrash }: { onCrash: () => void }) {
  useEffect(onCrash, [onCrash]);
  return null;
}

function getActiveSide(displayedTurnSeat: number | undefined, viewerSeat: number): number {
  if (displayedTurnSeat === undefined || displayedTurnSeat < 0) {
    return 0;
  }
  return displayedTurnSeat === viewerSeat ? 1 : -1;
}

function describeCards(permanents: readonly (Permanent | undefined)[]): string {
  return permanents
    .map((permanent) =>
      permanent
        ? [
            permanent.permanentId,
            permanent.topCard?.cardId,
            permanent.topCard?.artId,
            permanent.topCard?.faceUp,
            ...Array.from(permanent.stack ?? [], (card) => `${card.cardId}:${card.faceUp}`),
            "|",
            ...Array.from(permanent.linked ?? [], (card) => `${card.cardId}:${card.faceUp}`),
          ].join(",")
        : "",
    )
    .join(";");
}

function describeZones(zones: ArenaSideZones): string {
  const top: CardInstance | undefined = zones.trash[zones.trash.length - 1];
  return [zones.deckCount, zones.trash.length, top?.cardId, top?.artId, zones.eggCount, zones.securityCount].join(",");
}

function Arena3dLayerScene(props: Props) {
  const { board, viewerSeat, displayedTurnSeat } = props;
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const colors = useArenaSideColors({ board, paletteKey: props.paletteKey });
  const backUrl = useCardSleeve().src ?? DEFAULT_SLEEVE;
  const eggBackUrl = useEggSleeve().src ?? backUrl;
  const qualityChoice = arena3dQualityPreference.useChoice();
  const [probed] = useState(probeDeviceQuality);
  const [deviceClass] = useState(readArena3dDeviceClass);
  const [downgrades, setDowngrades] = useState(0);
  const recovery = useArena3dSceneRecovery();
  const { t } = useTranslation();
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const quality = resolveArena3dQuality({ choice: qualityChoice, probed, downgrades, deviceClass });
  const handleDowngrade = useCallback(() => setDowngrades((count) => count + 1), []);
  const pulses = useArenaPulses({
    board,
    viewerSeat,
    sideColors: colors,
    permanents: props.permanents,
    viewerBattleArea: props.viewerBattleArea,
    opponentBattleArea: props.opponentBattleArea,
    attackAnnouncement: props.attackAnnouncement,
    fieldClash: props.fieldClash,
    turnTransition: props.turnTransition,
    combatImpactIds: props.combatImpactIds,
    permanentBursts: props.permanentBursts,
    deleteBursts: props.deleteBursts,
    securityHitSeat: props.securityHitSeat,
    finale: props.finale,
    finaleTone: props.finaleTone,
    pileCounts: {
      viewerDeck: props.viewerZones.deckCount,
      opponentDeck: props.opponentZones.deckCount,
      viewerTrash: props.viewerZones.trash.length,
      opponentTrash: props.opponentZones.trash.length,
    },
  });
  const fieldPermanents = [
    ...props.viewerBattleArea,
    ...props.opponentBattleArea,
    props.opponentBreeding,
    props.viewerBreeding,
  ];
  const cardSignature = describeCards(fieldPermanents);
  const cards = useMemo(() => buildArenaFieldCards({ permanents: fieldPermanents, backUrl }), [cardSignature, backUrl]);
  const zoneSignature = `${describeZones(props.viewerZones)}/${describeZones(props.opponentZones)}`;
  const zones = useMemo(
    () => buildArenaZoneCards({ viewer: props.viewerZones, opponent: props.opponentZones, backUrl, eggBackUrl }),
    [zoneSignature, backUrl, eggBackUrl],
  );

  const viewerEffects = summarizeArenaFieldEffects(props.viewerFieldEffects);
  const opponentEffects = summarizeArenaFieldEffects(props.opponentFieldEffects);
  const fieldEffects = useMemo<Record<Side, ArenaFieldEffectState>>(
    () => ({ [Side.Viewer]: viewerEffects, [Side.Opponent]: opponentEffects }),
    [viewerEffects.signature, opponentEffects.signature],
  );

  const opponentBreedingId = props.opponentBreeding?.permanentId;
  const viewerBreedingId = props.viewerBreeding?.permanentId;
  const breedingPermanents = useMemo(
    () =>
      new Map([
        ...(opponentBreedingId ? [[`${Side.Opponent}:${ArenaZone.RAISING.value}`, opponentBreedingId] as const] : []),
        ...(viewerBreedingId ? [[`${Side.Viewer}:${ArenaZone.RAISING.value}`, viewerBreedingId] as const] : []),
      ]),
    [opponentBreedingId, viewerBreedingId],
  );

  if (recovery.status === Arena3dSceneStatus.RESTARTING.value) {
    return <Arena3dNotice message={t("redesign.foundation.boardStyle.restoring")} />;
  }

  if (recovery.status === Arena3dSceneStatus.STOPPED.value) {
    return noticeDismissed ? null : (
      <Arena3dNotice
        message={t("redesign.foundation.boardStyle.stopped")}
        retryLabel={t("redesign.foundation.boardStyle.retry")}
        onRetry={recovery.retry}
        onDismiss={() => setNoticeDismissed(true)}
      />
    );
  }

  return (
    <div className="arena-3d-scene" aria-hidden="true">
      <ClientErrorBoundary key={recovery.sceneKey} fallback={<SceneCrashSignal onCrash={recovery.handleCrash} />}>
        <Suspense fallback={null}>
          <Arena3dScene
            board={board}
            store={props.store}
            environment={props.environment}
            colors={colors}
            pulses={pulses}
            activeSide={getActiveSide(displayedTurnSeat, viewerSeat)}
            artSrc={props.artSrc}
            reducedMotion={reducedMotion}
            quality={quality}
            automaticQuality={qualityChoice === AUTO_ARENA_3D_QUALITY}
            cards={cards}
            zones={zones}
            breedingPermanents={breedingPermanents}
            deleteBursts={props.deleteBursts}
            backUrl={backUrl}
            memory={props.memory}
            memoryPrediction={props.memoryPrediction}
            fieldEffects={fieldEffects}
            breedingFocus={props.breedingFocus}
            onDowngrade={handleDowngrade}
            onContextLost={recovery.handleContextLost}
          />
        </Suspense>
      </ClientErrorBoundary>
    </div>
  );
}

export function Arena3dLayer(props: Props) {
  const [supported] = useState(isWebGlAvailable);
  if (!supported) {
    return null;
  }
  return <Arena3dLayerScene {...props} />;
}
