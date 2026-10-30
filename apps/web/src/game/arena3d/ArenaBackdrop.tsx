import { Suspense, useState, type RefObject } from "react";
import { ClientErrorBoundary } from "@/clientErrors/ClientErrorBoundary";
import { REDUCED_MOTION_QUERY } from "@/design/motion/reducedMotionQuery";
import { useMediaQuery } from "@/design/useMediaQuery";
import type { ArenaEnvironment } from "@/game/arena3d/ArenaEnvironment";
import { isWebGlAvailable } from "@/game/arena3d/isWebGlAvailable";
import { useArenaPulses } from "@/game/arena3d/useArenaPulses";
import { useArenaSideColors } from "@/game/arena3d/useArenaSideColors";
import type { Permanent } from "@aegis/shared";
import { useArenaCardMotion } from "@/game/arena3d/useArenaCardMotion";
import type { FieldClashScene } from "@/game/fieldClash";
import type { AttackAnnouncement } from "@/game/sidePanels";
import type { PermanentBurst } from "@/game/showcases";
import type { TurnTransitionCue } from "@/game/match/types";
import { createLazyComponent } from "@/net/createLazyComponent";

type Props = {
  board: RefObject<HTMLElement | null>;
  paletteKey: unknown;
  artSrc: string | undefined;
  environment: ArenaEnvironment;
  viewerSeat: number;
  displayedTurnSeat: number | undefined;
  permanents: RefObject<Record<string, HTMLDivElement | null>>;
  attackAnnouncement: AttackAnnouncement | null;
  turnTransition: TurnTransitionCue | null;
  combatImpactIds: ReadonlySet<string>;
  permanentBursts: ReadonlyMap<string, PermanentBurst>;
  securityHitSeat: number | null;
  fieldClash: FieldClashScene | null;
  viewerBattleArea: Iterable<Permanent> | undefined;
  opponentBattleArea: Iterable<Permanent> | undefined;
  pileCounts: { viewerDeck: number; opponentDeck: number; viewerTrash: number; opponentTrash: number };
};

const ArenaScene = createLazyComponent({
  load: () => import("@/game/arena3d/ArenaScene"),
  pick: (module) => module.ArenaScene,
});

function getActiveSide(displayedTurnSeat: number | undefined, viewerSeat: number): number {
  if (displayedTurnSeat === undefined || displayedTurnSeat < 0) {
    return 0;
  }
  return displayedTurnSeat === viewerSeat ? 1 : -1;
}

function ArenaBackdropScene(props: Props) {
  const { board, paletteKey, artSrc, environment, viewerSeat, displayedTurnSeat } = props;
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const colors = useArenaSideColors({ board, paletteKey });
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
    securityHitSeat: props.securityHitSeat,
    pileCounts: props.pileCounts,
  });

  return (
    <div className="arena-3d-scene" aria-hidden="true">
      <ClientErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <ArenaScene
            environment={environment}
            colors={colors}
            pulses={pulses}
            activeSide={getActiveSide(displayedTurnSeat, viewerSeat)}
            artSrc={artSrc}
            reducedMotion={reducedMotion}
          />
        </Suspense>
      </ClientErrorBoundary>
    </div>
  );
}

export function ArenaBackdrop(props: Props) {
  const [supported] = useState(isWebGlAvailable);
  useArenaCardMotion({
    board: props.board,
    permanents: props.permanents,
    viewerSeat: props.viewerSeat,
    viewerBattleArea: props.viewerBattleArea,
    opponentBattleArea: props.opponentBattleArea,
    attackAnnouncement: props.attackAnnouncement,
    fieldClash: props.fieldClash,
    combatImpactIds: props.combatImpactIds,
    permanentBursts: props.permanentBursts,
    turnTransition: props.turnTransition,
    securityHitSeat: props.securityHitSeat,
  });
  if (!supported) {
    return null;
  }
  return <ArenaBackdropScene {...props} />;
}
