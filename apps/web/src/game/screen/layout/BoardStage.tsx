import { arenaAppearancePreference } from "@/design/arenaAppearance/arenaAppearancePreference";
import { ArenaUiScale } from "@/design/arenaAppearance/ArenaUiScale";
import { useArenaViewport } from "@/game/screen/hooks/useArenaViewport";
import "@/design/arenaAppearance/arenaAppearance.css";
import { getGamePhase } from "@/game/screen/model/getGamePhase";
import { ManualBreedingChoice } from "@aegis/shared/manual/ManualBreedingChoice";
import { snapshotGameState } from "@/net/presentedState";
import { Phase } from "@aegis/shared/schema/enums";
import { ManualAction } from "@aegis/shared/manual/ManualAction";
import { GameMode } from "@aegis/shared/manual/GameMode";
import { ManualCombatControls } from "@/game/manual/ManualCombatControls";
import { ManualRevealGallery } from "@/game/manual/ManualRevealGallery";
import { ManualCombatStage } from "@aegis/shared/manual/ManualCombatStage";
import { ManualPermanentDialog } from "@/game/manual/ManualPermanentDialog";
import { ManualControls } from "@/game/manual/ManualControls";
import { sendManualCommand } from "@/game/manual/sendManualCommand";
import { ArenaInput } from "@/game/input/ArenaInput";
import { useArenaInputEnabled } from "@/game/input/useArenaInputEnabled";
import type { LowTimeWarning } from "@/game/useLowTimeWarning";
import { RollbackControls } from "@/game/RollbackControls";
/* The arena itself: the opponent's bar, the narration and the ticker, the field's three
   columns, the player's dock, and the free-floating cue layers over all of it.

   The overlays are portalled to the app's stage element when there is one, so a dialog
   is never clipped by the board's own overflow; the ghost that follows a held card goes
   to the document body for the same reason. */

import {
  useMemo,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { ChatBubble } from "../../chat/ChatBubble";
import { MatchChatWindow } from "../../chat/MatchChatWindow";
import type { MatchChat } from "../../chat/useMatchChat";
import type { MatchChatWindow as MatchChatWindowState } from "../../chat/useMatchChatWindow";
import type { ArenaBoardLook } from "../../arenaLook";
import type { HandSortDirection } from "@/game/HandSortDirection";
import type { HandSortMode } from "../../handSortMode";
import { createPortal } from "react-dom";
import type { GameState, Permanent, PlayerState, Seat } from "@aegis/shared";
import type { RevealedZones } from "../model/gameOutcome";
import { canAttackPlayerWith, canAttackWith, otherSeat } from "../../boardModel";
import type { LogEntry, LogLine } from "@/game/log/LogEntry";
import { useUnreadLogCount } from "@/game/log/useUnreadLogCount";
import type { SeatNames } from "@/game/log/SeatNames";
import type { SeatAvatars } from "@/game/log/SeatAvatars";
import { intents } from "../../../net/intents";
import { EndTurnDialog } from "./EndTurnDialog";
import { useEndTurnConfirmation } from "../hooks/useEndTurnConfirmation";
import { SurrenderDialog } from "./SurrenderDialog";
import { useTranslation } from "../../../i18n";
import { CardOpenerProvider } from "../../cardLinks";
import { OpponentSelectingPill } from "../../BoardDecisionRail";
import { opponentStatusKey } from "../../opponentStatus";
import { getActingPlateKeys } from "@/game/getActingPlateKeys";
import { NarrationStack } from "../../NarrationStack";
import { AttackAnnouncementBanner } from "../../SidePanelStack";
import { TargetingSpotlight } from "../../TargetingSpotlight";
import { EffectFocus } from "../../EffectFocus";
import { trashEffectCardFromSources, type EffectActivation } from "../../effectSource";
import { BATTLE_TIMING_STYLE } from "../../timings";
import { shieldSecurityCount } from "../../securityClash";
import { turnControlState } from "../../turnControl";
import { Side } from "../../side";
import type { DragIntent, DropTarget } from "../../dragIntents";
import type { DropAttrs, HandEntry } from "../../piece";
import type { MatchCues } from "../../match/types";
import { DragKind } from "../enums";
import type { DragState, PermanentChrome, PresentedPlayer, TrackingArrowGeometry } from "../types";
import type { useArenaLayout } from "../hooks/useArenaLayout";
import type { useBoardSelection } from "../hooks/useBoardSelection";
import type { useOverlayState } from "../hooks/useOverlayState";
import type { boardActions } from "../boardActions";
import type { matchIntents } from "../matchIntents";
import type { actionGuards } from "../model/actionGuards";
import { AttackArrowLayer } from "./AttackArrowLayer";
import { FieldEffectsIndicator } from "./FieldEffectsIndicator";
import { readFieldEffects } from "@/game/readFieldEffects";
import { BattleZones } from "./BattleZones";
import { BoardBurstLayer } from "./BoardBurstLayer";
import { DragGhost } from "./DragGhost";
import { FieldClashGhosts } from "./FieldClashGhosts";
import { LeftPileColumn } from "./LeftPileColumn";
import { LogTicker } from "./LogTicker";
import { FixedMatchLog } from "@/game/log/FixedMatchLog";
import { useMatchLogDisplay } from "@/game/log/useMatchLogDisplay";
import { DecisionMatchTimer, MatchTimer, SeriesBadge, viewerDecisionTimed } from "../../MatchTimer";
import { MemoryBand } from "./MemoryBand";
import { OpponentBar } from "./OpponentBar";
import { OpponentBattleRow } from "./OpponentBattleRow";
import { PlayerDock } from "./PlayerDock";
import { RightPileColumn } from "./RightPileColumn";
import { Sidebar } from "./Sidebar";
import { TurnBanner } from "./TurnBanner";
import { ViewerBattleRow } from "./ViewerBattleRow";
import { ViewerPiles } from "./ViewerPiles";
import { EffectConfirmButton } from "../../EffectConfirmButton";
import { useBreedingTransferOrigins } from "../../breedingTransfer";
import { useFieldShatterOrigins } from "../../fieldShatter";
import type { EffectSourceMark } from "@/game/effectMarks/EffectSourceMark";
import type { NarrationItem } from "../../narration";

const HIDDEN_NARRATION: ReadonlyMap<string, NarrationItem> = new Map();

export interface BoardAnchors {
  board: RefObject<HTMLDivElement | null>;
  field: RefObject<HTMLDivElement | null>;
  permanents: RefObject<Record<string, HTMLDivElement | null>>;
  permanentCenters: RefObject<Record<string, { x: number; y: number }>>;
  permanentCardIds: RefObject<Record<string, string>>;
  viewerSecurity: RefObject<HTMLDivElement | null>;
  opponentSecurity: RefObject<HTMLDivElement | null>;
  viewerDeck: RefObject<HTMLDivElement | null>;
  opponentDeck: RefObject<HTMLDivElement | null>;
  viewerHandDock: RefObject<HTMLDivElement | null>;
  opponentHandStrip: RefObject<HTMLDivElement | null>;
}

/** The seats as the board shows them, with the counts the readouts print. */
export interface BoardSeats {
  shownViewer: PresentedPlayer;
  shownOpponent: PresentedPlayer;
  breedingViewer: PresentedPlayer;
  breedingOpponent: PresentedPlayer;
  shownHandEntries: HandEntry[];
  shownHandCount: number;
  shownOpponentHandCount: number;
  /** Both players' hidden zones, once the server reveals them after the match. */
  revealed?: RevealedZones;
}

/** What the board prints rather than acts on: the turn, the memory and the log. */
export interface BoardReadouts {
  memory: number;
  memoryPrediction: number | undefined;
  displayedTurnSeat: Seat;
  displayedTurnCount: number;
  log: LogLine[];
  logEntries: readonly LogEntry[];
  seatNames: SeatNames;
  seatAvatars: SeatAvatars;
}

/** What the board lights, outlines or points at while a choice is open. */
export interface BoardTargeting {
  spotlight: { ids: readonly string[]; attacker: string | undefined; open: boolean };
  spotlightSubjects: Parameters<typeof TargetingSpotlight>[0]["subjects"];
  boardSize: { width: number; height: number };
  previewArrow: { from: { x: number; y: number }; to: { x: number; y: number } } | null;
  trackingArrow: TrackingArrowGeometry | null;
  attackerPermanent: Permanent | undefined;
  draggedAttackerPermanent: Permanent | undefined;
  canAttackSecurity: boolean;
  securityDecision: { selected: boolean; onToggle: () => void } | undefined;
  isBasePermanent: (perm: Permanent) => boolean;
  isDecisionCandidate: (perm: Permanent) => boolean;
}

/** The per-permanent and per-drop-area chrome both halves of the field read. */
export interface BoardChrome {
  permanentChrome: Omit<PermanentChrome, "suspendDelayMs">;
  unsuspendStagger: (index: number) => number;
  dropIntentAttrs: (target: DropTarget, id?: string) => DropAttrs;
  baseDropIntentAttrs: (permanentId: string) => DropAttrs;
  /** The class an effect resolving from a seat's trash marks the pile with. */
  trashEffectSource: (seat: Seat) => string | undefined;
}

/** The hand strip's own inputs, which the field does not share. */
export interface HandDockInputs {
  reorderDropBeforeInstanceId?: string | null;
  onMoveHandCard: (instanceId: string, direction: -1 | 1) => void;
  handSortMode: HandSortMode;
  handSortDirection: HandSortDirection;
  onSortHand: (mode: HandSortMode, direction: HandSortDirection) => void;
  effectSourceInstanceId: string | undefined;
  effectSource?: EffectActivation;
  effectSourceMarks?: ReadonlyMap<string, EffectSourceMark>;
  shakeInstanceId: string | undefined;
  selection:
    | {
        selectableInstanceIds: readonly string[];
        pickedInstanceIds: readonly string[];
        onToggle: (instanceId: string) => void;
        onInspect: (instanceId: string) => void;
      }
    | undefined;
  actionBar: { selCardId?: string; hasBase: boolean; linkingCardId?: string; onCancel: () => void } | undefined;
  reserveActionBarSpace: boolean;
  onHoverChange: (instanceId: string | undefined) => void;
}

export function BoardStage({
  spectating = false,
  replayMode = false,
  onLeaveSpectator,
  state,
  shownState,
  viewer,
  opponent,
  viewerSeat,
  room,
  chat,
  chatWindow,
  look,
  layout,
  anchors,
  cues,
  seats,
  guards,
  readouts,
  targeting,
  chrome,
  handDock,
  selection,
  overlays,
  actions,
  senders,
  drag,
  breedingDock,
  overlayStack,
  stageEl,
  onStartHandDrag,
  onStartPermanentDrag,
  onInspectPermanent,
  onOpenCard,
  promptSourceCardId,
  onResetScenario,
  timeWarning,
}: {
  state: GameState;
  shownState: GameState;
  viewer: PlayerState;
  opponent: PlayerState;
  viewerSeat: Seat;
  /** The card whose effect the viewer's open decision is about. */
  promptSourceCardId?: string | undefined;
  spectating?: boolean;
  replayMode?: boolean;
  onLeaveSpectator?: () => void;
  room: Parameters<typeof intents.surrender>[0] | undefined;
  /** Absent when there is no live room to talk through, as in a demo. */
  chat?: MatchChat;
  chatWindow: MatchChatWindowState;
  look: ArenaBoardLook;
  layout: ReturnType<typeof useArenaLayout>;
  anchors: BoardAnchors;
  cues: MatchCues;
  seats: BoardSeats;
  guards: ReturnType<typeof actionGuards>;
  readouts: BoardReadouts;
  targeting: BoardTargeting;
  chrome: BoardChrome;
  handDock: HandDockInputs;
  selection: ReturnType<typeof useBoardSelection>;
  overlays: ReturnType<typeof useOverlayState>;
  actions: ReturnType<typeof boardActions>;
  senders: ReturnType<typeof matchIntents>;
  drag: {
    state: DragState | null;
    isPlay: boolean;
    cardId: string | undefined;
    /** What releasing here would do, or nothing while the pointer is over no drop area. */
    hoveredIntent: DragIntent | undefined;
  };
  /** The raising area, which a portrait screen puts in the field instead of the dock. */
  breedingDock: ReactNode;
  overlayStack: ReactNode;
  /** The app's stage element, when the document has one to portal the overlays into. */
  stageEl: HTMLElement | null;
  onStartHandDrag: (index: number, event: ReactPointerEvent, origin?: HTMLElement) => void;
  onStartPermanentDrag: (perm: Permanent, event: ReactPointerEvent) => void;
  onInspectPermanent: { viewer: (perm: Permanent) => void; opponent: (perm: Permanent) => void };
  onOpenCard: (cardId: string, artId?: string) => void;
  onResetScenario?: () => void;
  timeWarning: LowTimeWarning;
}) {
  const { t } = useTranslation();
  const { scale } = arenaAppearancePreference.useAppearance();
  const scaleFactor = Object.values(ArenaUiScale).find((entry) => entry.value === scale)!.factor;
  const viewport = useArenaViewport({ factor: scaleFactor });
  const manualRevision = state.manual?.revision ?? 0;
  const manualState = useMemo(
    () => (state.gameMode === GameMode.MANUAL.value ? snapshotGameState(state) : state),
    [state, state.stateVersion, manualRevision],
  );
  const displayPhase = getGamePhase({ state: manualState });
  const manualPlayer = manualState.players[viewerSeat];
  const manualPermanent =
    manualState.gameMode === GameMode.MANUAL.value && !spectating
      ? [...(manualPlayer?.battleArea ?? []), ...(manualPlayer?.breeding ? [manualPlayer.breeding] : [])].find(
          (permanent) => permanent.permanentId === selection.selPerm,
        )
      : undefined;
  const arenaInputEnabled = useArenaInputEnabled();
  useBreedingTransferOrigins(anchors.board);
  useFieldShatterOrigins(anchors.board);
  const other = otherSeat(viewerSeat);
  const logUnread = useUnreadLogCount({ entries: readouts.logEntries, open: overlays.historyOpen });
  const matchLogDisplay = useMatchLogDisplay();
  const showsFixedLog = matchLogDisplay.showsPanel && !layout.narrowGameLayout;
  const shownNarration = matchLogDisplay.showsPopups || layout.narrowGameLayout ? cues.narration : HIDDEN_NARRATION;
  const endTurnConfirmation = useEndTurnConfirmation({
    phase: displayPhase,
    turnCount: state.turnCount,
    blocked: guards.endPhaseBlocked || !room,
    onEndPhase: () => {
      if (room) {
        if (state.gameMode === GameMode.MANUAL.value) {
          if (manualState.manual.turnPhase === Phase.Breeding) {
            sendManualCommand({
              room,
              command: { action: ManualAction.BREEDING.value, choice: ManualBreedingChoice.SKIP.value },
            });
          } else {
            sendManualCommand({ room, command: { action: ManualAction.PASS.value } });
          }
        } else {
          intents.endPhase(room);
        }
      }
    },
  });
  const endTurnDialog = endTurnConfirmation.open ? (
    <EndTurnDialog onConfirm={endTurnConfirmation.confirm} onClose={endTurnConfirmation.cancel} />
  ) : null;
  const opponentName =
    opponent.displayName || (spectating ? t("log.player", { n: opponent.seat + 1 }) : t("game.opponent"));
  // A spectator watches from one player's seat but is not that player.
  const viewerName = spectating ? viewer.displayName || t("log.player", { n: viewer.seat + 1 }) : t("chat.you");
  const { shownViewer, shownOpponent, breedingViewer, breedingOpponent } = seats;
  const surrenderDialog =
    !state.gameOver && !spectating && overlays.surrenderConfirmOpen ? (
      <SurrenderDialog
        onConfirm={() => {
          overlays.setSurrenderConfirmOpen(false);
          if (room && !state.gameOver) intents.surrender(room);
        }}
        onClose={() => overlays.setSurrenderConfirmOpen(false)}
      />
    ) : null;
  const viewerPiles = (
    <ViewerPiles
      viewer={shownViewer}
      docked={layout.dockViewerPiles}
      pileWidth={layout.arenaPileWidth}
      compactPiles={layout.compactPiles}
      viewerDeckRef={anchors.viewerDeck}
      viewerDeckRiffling={cues.deckRiffles.get(`${viewerSeat}:deck`) ?? false}
      viewerTrashClassName={chrome.trashEffectSource(viewerSeat) ?? ""}
      viewerTrashEffectCard={trashEffectCardFromSources(cues.effectSources, viewerSeat, shownViewer.trash)}
      onOpenViewerTrash={shownViewer.trash.length ? () => overlays.setTrashView(Side.Viewer) : undefined}
      onOpenViewerDeck={
        seats.revealed ? () => overlays.setRevealedZoneView({ side: Side.Viewer, zone: "deck" }) : undefined
      }
    />
  );
  const opponentBreeding = opponent.breeding;
  const resultShown = state.gameOver && !cues.resultPending;
  let opponentStatus = opponentStatusKey(state, viewerSeat);
  if (
    manualState.gameMode === GameMode.MANUAL.value &&
    manualState.manual.turnPhase === Phase.Breeding &&
    (spectating || manualState.turnSeat !== viewerSeat) &&
    !manualState.gameOver
  ) {
    opponentStatus = "manual.turn.waitingBreeding";
  }
  // An open turn reads as thinking only once the board has caught up; while the
  // opponent's last action still plays, the board itself is the feedback.
  const actingPlateKeys = getActingPlateKeys({
    state,
    displayedTurnSeat: readouts.displayedTurnSeat,
    viewerSeat,
    spectating,
  });
  const opponentIdle = !!state.pendingDecision || !!state.combatWindow || !cues.presenting;

  return (
    // Every surface that names a card — notices, side panels, combat prompts,
    // decision dialogs — opens it through this one blow-up.
    <CardOpenerProvider onOpenCard={onOpenCard}>
      <main
        ref={viewport.ref}
        data-arena-enlarged={scaleFactor > 1 || undefined}
        data-spectator={spectating || undefined}
        className="game-layout aegis-arena"
        data-viewer-seat={viewerSeat}
        style={{
          height: "100%",
          display: "flex",
          background: "var(--ds-paper)",
          overflow: "clip",
          ...BATTLE_TIMING_STYLE,
          ...look.style,
        }}
      >
        {manualPermanent && manualPlayer && manualState.players[1 - viewerSeat] ? (
          <ManualPermanentDialog
            combatActive={manualState.manual.combatStage !== ManualCombatStage.NONE.value}
            canDeclareAttack={
              !cues.presenting &&
              !cues.decisionAnimationsPending &&
              manualState.turnSeat === viewerSeat &&
              manualState.manual.turnPhase === Phase.Main
            }
            permanent={manualPermanent}
            deckCount={manualPlayer.deckCount}
            viewerSeat={viewerSeat}
            container={anchors.board.current}
            returnFocusTo={anchors.permanents.current[manualPermanent.permanentId]}
            opponent={manualState.players[1 - viewerSeat]!}
            room={room}
            disabled={
              !room ||
              manualState.gameOver ||
              manualState.turnCount === 0 ||
              manualState.manual.undoRequester !== -1 ||
              manualState.manual.resultRequester !== -1 ||
              manualState.manual.restartRequester !== -1
            }
            onClose={() => selection.setSelPerm(null)}
          />
        ) : null}
        {manualState.gameMode === GameMode.MANUAL.value &&
        (manualState.manual.revealedJson !== "[]" ||
          manualState.manual.combatStage !== ManualCombatStage.NONE.value) ? (
          <aside className="manual-public-status">
            <ManualCombatControls
              state={manualState}
              seat={viewerSeat}
              spectating={spectating}
              compact
              send={(command) => {
                if (room) {
                  sendManualCommand({ room, command });
                }
              }}
            />
            <ManualRevealGallery
              state={manualState}
              seat={viewerSeat}
              disabled={
                spectating ||
                !room ||
                manualState.gameOver ||
                manualState.turnCount === 0 ||
                manualState.manual.undoRequester !== -1 ||
                manualState.manual.resultRequester !== -1 ||
                manualState.manual.restartRequester !== -1
              }
              send={(command) => {
                if (room) {
                  sendManualCommand({ room, command });
                }
              }}
            />
          </aside>
        ) : null}
        <ManualControls
          presenting={cues.presenting || cues.decisionAnimationsPending}
          state={manualState}
          room={room}
          seat={viewerSeat}
          spectating={spectating}
          selectedHand={selection.handSel}
        />
        {arenaInputEnabled ? (
          <ArenaInput
            root={anchors.board}
            cancelable={!!(selection.handSel || selection.handPreview || selection.selPerm || selection.linkSel)}
            onCancel={selection.clearSel}
          />
        ) : null}
        <div
          className="game-board aegis-arena-surface"
          ref={anchors.board}
          data-arena-enlarged={scaleFactor > 1 || undefined}
          data-art={look.hasArt || undefined}
          data-timer-decision={viewerDecisionTimed(state, viewerSeat) || undefined}
          style={{
            ...({
              "--arena-scaled-hand-width": `${layout.handCardWidth}px`,
              "--arena-raising-width": `${layout.arenaRaisingWidth}px`,
              "--arena-field-pile-width": `${layout.arenaPileWidth}px`,
              "--arena-sideline-basis-width": `${layout.arenaSidelineBasisWidth}px`,
            } as CSSProperties),
            flex: 1,
            minHeight: viewport.minHeight,
            position: "relative",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <OpponentBar
            spectating={spectating}
            spectatorCode={!state.gameOver ? state.spectatorCode : undefined}
            spectatorNamesJson={!spectating ? state.players[viewerSeat]?.spectatorNamesJson : undefined}
            anonymousSpectatorCount={state.players[viewerSeat]?.anonymousSpectatorCount}
            onResetScenario={onResetScenario}
            timer={
              (state.series?.bestOf ?? 1) > 1 ? (
                <span className="match-clock-group">
                  <SeriesBadge state={state} viewerSeat={viewerSeat} />
                  {state.matchTimer ? <MatchTimer state={state} seat={other} opponent /> : null}
                </span>
              ) : state.matchTimer ? (
                <MatchTimer state={state} seat={other} opponent />
              ) : undefined
            }
            handStripRef={anchors.opponentHandStrip}
            opponentName={opponentName}
            opponentAvatarId={opponent.avatarId}
            opponentEquippedRankedTier={opponent.equippedRankedTier}
            opponentBotPersonaId={opponent.botPersonaId}
            viewerSeat={viewerSeat}
            displayedTurnSeat={readouts.displayedTurnSeat}
            displayedTurnCount={readouts.displayedTurnCount}
            actingLabel={actingPlateKeys.opponent ? t(actingPlateKeys.opponent) : undefined}
            phase={getGamePhase({ state: shownState })}
            memory={readouts.memory}
            eggDeckCount={breedingOpponent.eggDeckCount}
            handCount={seats.shownOpponentHandCount}
            revealedHand={
              seats.revealed?.opponent.hand ??
              (replayMode && opponent.hand.length > 0 ? Array.from(opponent.hand) : undefined)
            }
            deckCount={shownOpponent.deckCount}
            trashCount={shownOpponent.trash.length}
            rollbackControls={
              room && !spectating ? (
                <RollbackControls
                  state={state}
                  room={room}
                  seat={viewerSeat}
                  menu={layout.portraitArena}
                  compact={layout.narrowGameLayout}
                />
              ) : undefined
            }
            portraitArena={layout.portraitArena}
            narrowGameLayout={layout.narrowGameLayout}
            skippable={cues.presenting || cues.decisionAnimationsPending}
            onOpenLog={() => overlays.setHistoryOpen(true)}
            onReportBug={() => overlays.setBugReportOpen(true)}
            onOpenArenaLook={() => overlays.setArenaLookOpen(true)}
            onToggleChat={chat ? chatWindow.toggle : undefined}
            chatOpen={chatWindow.open}
            chatUnread={chatWindow.unread}
            logUnread={logUnread}
            gameOver={state.gameOver}
            onSurrender={
              spectating || state.gameOver ? () => onLeaveSpectator?.() : () => overlays.setSurrenderConfirmOpen(true)
            }
            onSkipPresentation={() => cues.skipAnimations()}
          />

          <DecisionMatchTimer state={state} seat={viewerSeat} />
          {/* One moment at a time. The portrait phone folds both sides into a single
              centred slot; everywhere else the viewer reads the left corner and the
              opponent's moments arrive in the right one. */}
          <div className="game-board-notices">
            {opponentStatus && opponentIdle && !cues.zoneShowcase && !cues.revealShowcase ? (
              <OpponentSelectingPill status={opponentStatus} />
            ) : null}
            {!resultShown ? (
              <NarrationStack
                narration={shownNarration}
                rejection={cues.rejection}
                compact={layout.collapseNotices}
                promptSourceCardId={promptSourceCardId}
                securityDockActive={cues.securityBranch !== null || cues.optionBranch !== null}
                onAdvance={cues.advanceNarration}
                onDismissRejection={cues.dismissRejection}
                timeWarning={timeWarning}
                onHold={cues.holdNarration}
                confirmation={
                  cues.effectAwaitingConfirmation ? <EffectConfirmButton onConfirm={cues.confirmEffect} /> : undefined
                }
              />
            ) : null}
          </div>

          {cues.attackAnnouncement && !resultShown ? (
            <AttackAnnouncementBanner announcement={cues.attackAnnouncement} />
          ) : null}

          {/* Desktop replaced the sidebar with this slim ticker, kept unobtrusive at the
              board's right edge. The header's log button opens the full history sheet. */}
          {!layout.narrowGameLayout ? (
            <LogTicker
              log={readouts.log}
              viewerSeat={viewerSeat}
              displayedTurnSeat={readouts.displayedTurnSeat}
              displayedTurnCount={readouts.displayedTurnCount}
              memory={readouts.memory}
            />
          ) : null}

          {showsFixedLog ? (
            <FixedMatchLog
              entries={readouts.logEntries}
              viewerSeat={spectating ? undefined : viewerSeat}
              playerNames={readouts.seatNames}
              playerAvatars={readouts.seatAvatars}
              onExpand={() => overlays.setHistoryOpen(true)}
              onOpenCard={overlays.setZoomCardId}
            />
          ) : null}

          {cues.turnTransition ? <TurnBanner transition={cues.turnTransition} viewerSeat={viewerSeat} /> : null}

          <EffectFocus
            sources={cues.effectSources}
            board={anchors.board}
            permanents={anchors.permanents}
            choosingTargets={targeting.spotlight.open}
          />

          <div
            className="game-field"
            ref={anchors.field}
            style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", overflow: "hidden", position: "relative" }}
          >
            {/* The breeding step is about one slot: the field dims behind the dock,
                which keeps the raising area, the hand that digivolves into it and
                the turn control lit. Notices, panels and dialogs all sit above. */}
            {guards.breedingActionsOpen ? <div className="game-breeding-mode" aria-hidden="true" /> : null}
            {/* Outlines mark the cards the server offered without dimming the field.
                The cards underneath keep every pointer event. */}
            {targeting.spotlight.open ? (
              <TargetingSpotlight
                subjects={targeting.spotlightSubjects}
                width={targeting.boardSize.width}
                height={targeting.boardSize.height}
              />
            ) : null}
            <LeftPileColumn
              opponent={shownOpponent}
              viewer={shownViewer}
              pileWidth={layout.arenaPileWidth}
              compactPiles={layout.compactPiles}
              opponentDeckRef={anchors.opponentDeck}
              viewerSecurityRef={anchors.viewerSecurity}
              opponentDeckRiffling={cues.deckRiffles.get(`${other}:deck`) ?? false}
              opponentTrashClassName={chrome.trashEffectSource(other) ?? ""}
              opponentTrashEffectCard={trashEffectCardFromSources(cues.effectSources, other, shownOpponent.trash)}
              securityCount={
                cues.securityDealCounts.get(viewerSeat) ??
                shieldSecurityCount(shownViewer.securityCount, cues.heldSecurityCounts.get(viewerSeat))
              }
              securityBreak={cues.securityBreak}
              securityBreakMine={cues.securityBreak?.seat === viewerSeat}
              securityHit={cues.securityHitSeat === viewerSeat}
              securityLanding={cues.securityFlights.get(viewerSeat)}
              onOpenOpponentTrash={shownOpponent.trash.length ? () => overlays.setTrashView(Side.Opponent) : undefined}
              onOpenOpponentDeck={
                seats.revealed ? () => overlays.setRevealedZoneView({ side: Side.Opponent, zone: "deck" }) : undefined
              }
              onOpenViewerSecurity={shownViewer.securityCount ? () => overlays.setSecurityView(Side.Viewer) : undefined}
            />

            <FieldEffectsIndicator
              json={shownOpponent.fieldEffectsJson}
              ownField={false}
              playerNames={[
                shownState.players[0]?.displayName || t("log.player", { n: 1 }),
                shownState.players[1]?.displayName || t("log.player", { n: 2 }),
              ]}
            />
            <FieldEffectsIndicator
              json={shownViewer.fieldEffectsJson}
              ownField
              playerNames={[
                shownState.players[0]?.displayName || t("log.player", { n: 1 }),
                shownState.players[1]?.displayName || t("log.player", { n: 2 }),
              ]}
            />
            <BattleZones
              opponentFieldEffects={readFieldEffects(shownOpponent.fieldEffectsJson).length > 0}
              viewerFieldEffects={readFieldEffects(shownViewer.fieldEffectsJson).length > 0}
            >
              <OpponentBattleRow
                permanents={shownOpponent.battleArea}
                chrome={{
                  ...chrome.permanentChrome,
                  suspendDelayMs: chrome.unsuspendStagger,
                }}
                attackerPermanent={targeting.attackerPermanent}
                draggedAttackerPermanent={targeting.draggedAttackerPermanent}
                vortexMode={selection.vortexMode}
                dropIntentAttrs={chrome.dropIntentAttrs}
                isDecisionCandidate={targeting.isDecisionCandidate}
                onPermanentClick={actions.onOppPerm}
                onPermanentInspect={onInspectPermanent.opponent}
              />
              <MemoryBand
                phaseBanner={cues.phaseBanner}
                memory={readouts.memory}
                compact={layout.compactPiles}
                displayedPhase={
                  state.gameMode === GameMode.MANUAL.value
                    ? displayPhase
                    : (cues.displayedPhase ?? getGamePhase({ state: shownState }))
                }
                phaseSweeping={cues.unsuspendSweep !== null}
                memoryPrediction={readouts.memoryPrediction}
                turnControlState={turnControlState({ phase: displayPhase, turnSeat: state.turnSeat, viewerSeat })}
                endPhaseBlocked={guards.endPhaseBlocked}
                onEndPhase={endTurnConfirmation.request}
              />
              <ViewerBattleRow
                permanents={shownViewer.battleArea}
                chrome={{
                  ...chrome.permanentChrome,
                  suspendDelayMs: chrome.unsuspendStagger,
                }}
                dragIsPlay={drag.isPlay}
                selectedAttackerPermanentId={selection.selPerm}
                isBasePermanent={targeting.isBasePermanent}
                isDecisionCandidate={targeting.isDecisionCandidate}
                draggable={(perm) =>
                  !guards.mainActionBlocked && !selection.handSel && !selection.linkSel && canAttackWith(perm)
                }
                dropIntentAttrs={chrome.dropIntentAttrs}
                baseDropIntentAttrs={chrome.baseDropIntentAttrs}
                onPermanentClick={actions.onYourPerm}
                onPermanentPointerDown={onStartPermanentDrag}
                onPermanentInspect={onInspectPermanent.viewer}
              />
            </BattleZones>

            {layout.portraitArena ? breedingDock : null}

            <RightPileColumn
              opponent={shownOpponent}
              opponentBreeding={breedingOpponent}
              viewerPiles={layout.dockViewerPiles ? null : viewerPiles}
              pileWidth={layout.arenaPileWidth}
              raisingWidth={layout.arenaRaisingWidth}
              compactPiles={layout.compactPiles}
              opponentSecurityRef={anchors.opponentSecurity}
              opponentEggDeckRiffling={cues.deckRiffles.get(`${other}:eggDeck`) ?? false}
              breedingBurst={
                breedingOpponent.breeding ? cues.permanentBursts.get(breedingOpponent.breeding.permanentId) : undefined
              }
              breedingEffectSource={
                !!breedingOpponent.breeding &&
                chrome.permanentChrome.effectSourcePermanentIds.has(breedingOpponent.breeding.permanentId)
              }
              breedingEffectLinked={
                !!breedingOpponent.breeding &&
                chrome.permanentChrome.effectLinkedPermanentIds.has(breedingOpponent.breeding.permanentId)
              }
              breedingHighlight={
                !!breedingOpponent.breeding &&
                chrome.permanentChrome.decisionHighlightPermanentId === breedingOpponent.breeding.permanentId
              }
              securityCount={
                cues.securityDealCounts.get(other) ??
                shieldSecurityCount(shownOpponent.securityCount, cues.heldSecurityCounts.get(other))
              }
              securityBreak={cues.securityBreak}
              securityBreakMine={cues.securityBreak?.seat === other}
              securityHit={cues.securityHitSeat === other}
              securityLanding={cues.securityFlights.get(other)}
              securityDrop={{ "data-drop": "opp-security", ...chrome.dropIntentAttrs("opp-security") }}
              attackable={
                targeting.securityDecision !== undefined ||
                targeting.canAttackSecurity ||
                canAttackPlayerWith(targeting.draggedAttackerPermanent, false)
              }
              selected={targeting.securityDecision?.selected}
              onOpenOpponentBreeding={
                opponentBreeding ? () => actions.showCardMenu(opponentBreeding.permanentId, Side.Opponent) : undefined
              }
              onAttackSecurity={
                targeting.securityDecision
                  ? targeting.securityDecision.onToggle
                  : selection.selPerm && targeting.canAttackSecurity
                    ? () => senders.attack(selection.selPerm!, { kind: "player" }, selection.vortexMode)
                    : undefined
              }
              onOpenOpponentSecurity={
                shownOpponent.securityCount ? () => overlays.setSecurityView(Side.Opponent) : undefined
              }
              onOpenOpponentEggDeck={
                seats.revealed
                  ? () => overlays.setRevealedZoneView({ side: Side.Opponent, zone: "eggDeck" })
                  : undefined
              }
            />
          </div>

          <PlayerDock
            spectating={spectating}
            handSortMode={handDock.handSortMode}
            handSortDirection={handDock.handSortDirection}
            showRecordedHand={replayMode && seats.shownHandEntries.length > 0}
            onSortHand={handDock.onSortHand}
            onMoveHandCard={handDock.onMoveHandCard}
            reorderDropBeforeInstanceId={handDock.reorderDropBeforeInstanceId}
            timer={state.matchTimer ? <MatchTimer state={state} seat={viewerSeat} /> : undefined}
            playerName={spectating ? viewerName : viewer.displayName || t("game.you")}
            playerAvatarId={viewer.avatarId}
            playerEquippedRankedTier={viewer.equippedRankedTier}
            playerBotPersonaId={viewer.botPersonaId}
            actingLabel={actingPlateKeys.viewer ? t(actingPlateKeys.viewer) : undefined}
            breedingDock={!layout.portraitArena ? breedingDock : null}
            pileDock={layout.dockViewerPiles ? viewerPiles : null}
            handDockRef={anchors.viewerHandDock}
            cardWidth={layout.handCardWidth}
            minExposure={layout.handMinExposure}
            cards={seats.shownHandEntries}
            selectedInstanceId={selection.handSel ?? undefined}
            effectSourceInstanceId={handDock.effectSourceInstanceId}
            effectSource={handDock.effectSource}
            effectSourceMarks={handDock.effectSourceMarks}
            selection={handDock.selection}
            draggingInstanceId={drag.isPlay && drag.state?.kind === DragKind.Play ? drag.state.instanceId : undefined}
            shakeInstanceId={handDock.shakeInstanceId}
            actionBar={state.gameMode === GameMode.MANUAL.value ? undefined : handDock.actionBar}
            reserveActionBarSpace={handDock.reserveActionBarSpace}
            eggDeckCount={breedingViewer.eggDeckCount}
            handCount={spectating ? shownViewer.handCount : seats.shownHandCount}
            deckCount={shownViewer.deckCount}
            trashCount={shownViewer.trash.length}
            startDrag={onStartHandDrag}
            selectCard={(index) => {
              const entry = seats.shownHandEntries[index];
              if (entry) {
                if (replayMode) onOpenCard(entry.cardId, entry.artId);
                else actions.selectHandCard(entry);
              }
            }}
            onHoverChange={handDock.onHoverChange}
          />

          <AttackArrowLayer preview={targeting.previewArrow} tracking={targeting.trackingArrow} />

          <FieldClashGhosts
            scene={cues.fieldClash}
            permanentRefs={anchors.permanents}
            permanentCenters={anchors.permanentCenters}
            permanentCardIds={anchors.permanentCardIds}
            combatImpactIds={cues.combatImpactIds}
          />

          <BoardBurstLayer
            deleteBursts={cues.deleteBursts}
            drawBursts={cues.drawBursts}
            drawFlights={cues.drawFlights}
          />
        </div>

        {/* Desktop plays without the sidebar — its controls moved to the header
            cluster and the end-turn orb; the log opens from the header.
            The narrow layout keeps it: there it collapses into the touch strip. */}
        {layout.narrowGameLayout && !spectating ? (
          <Sidebar
            phase={displayPhase}
            turnCount={state.turnCount}
            memory={readouts.memory}
            isMyTurn={guards.isMyTurn}
            canMove={guards.breedingActionsOpen && guards.canMoveOutOfBreeding}
            hasBreeding={!!viewer.breeding}
            canHatch={guards.breedingActionsOpen && guards.canHatchEgg}
            narrow
            log={readouts.log}
            onHatchOrMove={actions.onBreeding}
            onSurrender={
              spectating || state.gameOver ? () => onLeaveSpectator?.() : () => overlays.setSurrenderConfirmOpen(true)
            }
            onReportBug={() => overlays.setBugReportOpen(true)}
          />
        ) : null}

        {stageEl ? createPortal(overlayStack, stageEl) : overlayStack}

        {endTurnDialog && stageEl ? createPortal(endTurnDialog, stageEl) : endTurnDialog}

        {surrenderDialog && stageEl ? createPortal(surrenderDialog, stageEl) : surrenderDialog}

        {chat ? (
          <>
            <ChatBubble entry={chat.latest[other]} side="opponent" senderName={opponentName} boardRef={anchors.board} />
            <ChatBubble
              entry={chat.latest[viewerSeat]}
              side="player"
              senderName={viewerName}
              boardRef={anchors.board}
            />
            {chatWindow.open ? (
              <MatchChatWindow
                chat={chat}
                spectating={spectating}
                seatNames={
                  {
                    [viewerSeat]: viewer.displayName || t("game.you"),
                    [other]: opponentName,
                  } as Record<Seat, string>
                }
                onClose={chatWindow.close}
              />
            ) : null}
          </>
        ) : null}

        {drag.cardId ? (
          <DragGhost
            cardId={drag.cardId}
            artId={drag.state?.artId}
            x={drag.state!.x}
            y={drag.state!.y}
            intent={drag.hoveredIntent}
            coarsePointer={layout.coarsePointer}
          />
        ) : null}
      </main>
    </CardOpenerProvider>
  );
}
