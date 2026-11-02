/* Every surface the board can have open over it: the card menu, the stack and pile
   viewers, the play-choice prompts, the match log, the card blow-up and the bug report.

   Most of them are unfinished business, so server authority closing the window they
   belong to closes them too: a new decision, a combat window, a phase, a turn, or the
   end of the match. Windows that only show cards are exempt, so the viewer can read
   the opponent's turn card by card (#55). The stack viewer stays until the viewer
   closes it or the permanent leaves the board. The opponent's card menu, the trash
   and the security viewer stay until the viewer closes them, the card leaves the
   board, the viewer gets a decision of their own (which they must not cover), or
   the match ends. What a decision or combat window of the viewer's own closed reopens
   once the viewer has answered it, so they return to the card they were reading. */

import { useEffect, useRef, useState } from "react";
import type { DecisionRequest, GameState } from "@aegis/shared";
import { combatWindowKey } from "@aegis/shared/schema/GameState";
import type { Seat } from "@aegis/shared/schema/enums";
import { Side } from "../../side";
import type { RevealedZoneView } from "../model/gameOutcome";
import type { DnaMaterialSelection } from "../model/dnaMaterialSelection";
import type {
  AppFusionChoice,
  AssemblyPick,
  CardMenuAnchor,
  DigiXrosPick,
  DualPlayChoice,
  EvoCostChoice,
  PendingActionConfirmation,
} from "../types";

type Inspection = {
  cardMenu: CardMenuAnchor | null;
  stackView: string | null;
  trashView: Side | null;
  securityView: Side | null;
  handPreview: string | null;
};

type InspectionStillPresentParams = {
  inspection: Inspection;
  state: GameState | undefined;
  viewerSeat: Seat;
};

type OverlayStateParams = {
  decision: DecisionRequest | undefined;
  state: GameState | undefined;
  handPreview: string | null;
  setHandPreview: (instanceId: string | null) => void;
  clearSel: () => void;
  clearDeclarations: () => void;
  viewerSeat: Seat;
};

function hasInspection(inspection: Inspection): boolean {
  return Object.values(inspection).some((value) => value !== null);
}

function getInspectionStillPresent({ inspection, state, viewerSeat }: InspectionStillPresentParams): Inspection {
  const permanentIds = new Set(
    Array.from(state?.players ?? []).flatMap((player) => [
      ...Array.from(player.battleArea, (permanent) => permanent.permanentId),
      ...(player.breeding ? [player.breeding.permanentId] : []),
    ]),
  );
  const handInstanceIds = new Set(Array.from(state?.players[viewerSeat]?.hand ?? [], (card) => card.instanceId));
  return {
    cardMenu: inspection.cardMenu && permanentIds.has(inspection.cardMenu.permanentId) ? inspection.cardMenu : null,
    stackView: inspection.stackView && permanentIds.has(inspection.stackView) ? inspection.stackView : null,
    trashView: inspection.trashView,
    securityView: inspection.securityView,
    handPreview: inspection.handPreview && handInstanceIds.has(inspection.handPreview) ? inspection.handPreview : null,
  };
}

export function useOverlayState({
  decision,
  state,
  handPreview,
  setHandPreview,
  clearSel,
  clearDeclarations,
  viewerSeat,
}: OverlayStateParams) {
  /** The permanent whose action menu is open, and where to anchor it. */
  const [cardMenu, setCardMenu] = useState<CardMenuAnchor | null>(null);
  /** The permanent whose stack viewer is open, by permanent id. */
  const [stackView, setStackView] = useState<string | null>(null);
  /** Which player's trash is open. */
  const [trashView, setTrashView] = useState<Side | null>(null);
  /** Which player's security stack is open. */
  const [securityView, setSecurityView] = useState<Side | null>(null);
  /** Which face-down pile is open, once the match is over and the server revealed it. */
  const [revealedZoneView, setRevealedZoneView] = useState<RevealedZoneView | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  useEffect(() => {
    setPicks([]);
  }, [decision?.decisionId]);
  // A board-mode decision the viewer asked to see in the dialog instead (Escape
  // or the rail's back arrow). Reset with every new decision.
  const [decisionAsDialog, setDecisionAsDialog] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // A card name clicked in the play log opens the card itself, without closing the log.
  const [zoomCardId, setZoomCardId] = useState<string | null>(null);
  const [zoomArtId, setZoomArtId] = useState<string | undefined>();
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [arenaLookOpen, setArenaLookOpen] = useState(false);
  const [surrenderConfirmOpen, setSurrenderConfirmOpen] = useState(false);
  const [dualPlay, setDualPlay] = useState<DualPlayChoice | null>(null);
  const [assemblyPick, setAssemblyPick] = useState<AssemblyPick | null>(null);
  const [evoCostChoice, setEvoCostChoice] = useState<EvoCostChoice | null>(null);
  const [digiXrosPick, setDigiXrosPick] = useState<DigiXrosPick | null>(null);
  const [appFusionChoice, setAppFusionChoice] = useState<AppFusionChoice | null>(null);
  const [actionConfirm, setActionConfirm] = useState<PendingActionConfirmation | null>(null);
  const [dnaMaterialSelection, setDnaMaterialSelection] = useState<DnaMaterialSelection | null>(null);

  // Discard unfinished declarations when server authority changes their action window.
  useEffect(() => {
    clearDeclarations();
    setCardMenu((menu) => (menu?.side === Side.Opponent ? menu : null));
    setDigiXrosPick(null);
    setAssemblyPick(null);
    setActionConfirm(null);
    setDnaMaterialSelection(null);
    setEvoCostChoice(null);
    setAppFusionChoice(null);
    setDecisionAsDialog(false);
  }, [
    clearDeclarations,
    decision?.decisionId,
    state?.pendingDecision?.decisionId,
    state?.combatWindow?.kind,
    state?.phase,
    state?.turnSeat,
    state?.gameOver,
  ]);

  const ownDecisionId = decision?.decisionId;
  const gameOver = state?.gameOver;
  const ownCombatWindowKey = state?.combatWindow?.seat === viewerSeat ? combatWindowKey(state.combatWindow) : undefined;
  const latest = useRef({
    state,
    setHandPreview,
    inspection: { cardMenu, stackView, trashView, securityView, handPreview },
  });
  latest.current = { state, setHandPreview, inspection: { cardMenu, stackView, trashView, securityView, handPreview } };
  const parkedInspection = useRef<Inspection | null>(null);
  useEffect(() => {
    const { inspection, state: currentState, setHandPreview: restoreHandPreview } = latest.current;
    if (!ownDecisionId && !gameOver && !ownCombatWindowKey) {
      const parked = parkedInspection.current;
      parkedInspection.current = null;
      if (!parked || hasInspection(inspection)) {
        return;
      }
      const restored = getInspectionStillPresent({ inspection: parked, state: currentState, viewerSeat });
      setCardMenu(restored.cardMenu);
      setStackView(restored.stackView);
      setTrashView(restored.trashView);
      setSecurityView(restored.securityView);
      restoreHandPreview(restored.handPreview);
      return;
    }
    const interrupted = {
      ...inspection,
      cardMenu: inspection.cardMenu?.side === Side.Opponent ? inspection.cardMenu : null,
    };
    if (gameOver) {
      parkedInspection.current = null;
    } else if (hasInspection(interrupted)) {
      parkedInspection.current = interrupted;
    }
    clearSel();
    setCardMenu(null);
    setStackView(null);
    setTrashView(null);
    setSecurityView(null);
  }, [ownDecisionId, gameOver, ownCombatWindowKey, clearSel, viewerSeat]);

  return {
    cardMenu,
    setCardMenu,
    stackView,
    setStackView,
    trashView,
    setTrashView,
    securityView,
    setSecurityView,
    revealedZoneView,
    setRevealedZoneView,
    picks,
    setPicks,
    decisionAsDialog,
    setDecisionAsDialog,
    historyOpen,
    setHistoryOpen,
    zoomCardId,
    setZoomCardId,
    zoomArtId,
    setZoomArtId,
    bugReportOpen,
    setBugReportOpen,
    arenaLookOpen,
    setArenaLookOpen,
    surrenderConfirmOpen,
    setSurrenderConfirmOpen,
    dualPlay,
    setDualPlay,
    assemblyPick,
    setAssemblyPick,
    evoCostChoice,
    setEvoCostChoice,
    digiXrosPick,
    setDigiXrosPick,
    appFusionChoice,
    setAppFusionChoice,
    actionConfirm,
    setActionConfirm,
    dnaMaterialSelection,
    setDnaMaterialSelection,
  };
}
