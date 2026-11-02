import type { TournamentSpectateTarget } from "@/tournaments/TournamentSpectateTarget";
import { arenaAppearancePreference } from "@/design/arenaAppearance/arenaAppearancePreference";
import { ArenaUiScale } from "@/design/arenaAppearance/ArenaUiScale";
import type { BotSettings } from "@aegis/shared/bot/BotSettings";
import { GameMode } from "@aegis/shared/manual/GameMode";
import { getDecisionMaterialSelectionOrder } from "@/game/screen/model/getDecisionMaterialSelectionOrder";
import { UsedDeckDialog } from "@/game/UsedDeckDialog";
import { MatchQueueActivity } from "@/matchmaking/MatchQueueActivity";
import { getMatchQueueSelection } from "@/matchmaking/getMatchQueueSelection";
import { collectViewerCardArtIds } from "@/screens/cardLanguage/collectViewerCardArtIds";
import { ViewerCardArtIdsContext } from "@/screens/cardLanguage/ViewerCardArtIdsContext";
import type { DeckListing } from "@/game/decks";
import { downloadReplay } from "../replays/files";
/* The in-game board — the design's letterboxed board layout, driven entirely by
   the synchronized GameState and wired to the server through typed intents. The
   client owns zero rules: every action is an intent the server validates, and the
   board is a pure render of what the server sends back (ARCHITECTURE.md §4). */

import { isFieldTargetDecision } from "./decisionPresentation";
import { DragKind } from "./screen/enums";
import { useArenaLayout } from "./screen/hooks/useArenaLayout";
import { useFittedCardWidths } from "./screen/hooks/useFittedCardWidths";
import { combatWindowsFor } from "./screen/model/combatWindows";
import { counterSources, counterTargetIds } from "./overlay/combat/CounterOverlay";
import { decisionViewFor } from "./screen/model/decisionView";
import { useBoardMeasurements } from "./screen/hooks/useBoardMeasurements";
import { resolveFieldDepartureFace, type FieldShatterFace } from "./fieldShatter";
import { useAttackPreviewArrow } from "./screen/hooks/useAttackPreviewArrow";
import { useBoardSelection } from "./screen/hooks/useBoardSelection";
import { useOverlayState } from "./screen/hooks/useOverlayState";
import { useDragPlumbing } from "./screen/hooks/useDragPlumbing";
import { useTrackingArrow } from "./screen/hooks/useTrackingArrow";
import { readAttackArrowClock } from "./attackArrowClock";
import { boardActions } from "./screen/boardActions";
import { matchIntents } from "./screen/matchIntents";
import { PendingMatchBoard } from "./screen/layout/PendingMatchBoard";
import { pendingMatchNotice } from "./screen/model/pendingMatchNotice";
import { getGuestApprovalView } from "@/game/screen/model/getGuestApprovalView";
import { GUEST_APPROVAL_CHANNEL } from "@aegis/shared/protocol/GuestApprovalMessage";
import { sourceHostChoiceFor } from "./screen/model/sourceHostChoice";
import { BoardStage, type BoardAnchors } from "./screen/layout/BoardStage";
import { useMatchChat } from "./chat/useMatchChat";
import { useMatchChatWindow } from "./chat/useMatchChatWindow";
import { BreedingDock } from "./screen/layout/BreedingDock";
import { MatchOverlays } from "./screen/layout/MatchOverlays";

export { HandCardPreview } from "./screen/layout/HandCardPreview";
export { Sidebar } from "./screen/layout/Sidebar";
import {
  appFusionHostIdsOf as modelAppFusionHostIdsOf,
  digivolveRoutesOf as modelDigivolveRoutesOf,
  digivolveTargetsOf as modelDigivolveTargetsOf,
  eligibleBase as modelEligibleBase,
  linkTargetsOfPermanent as modelLinkTargetsOfPermanent,
} from "./screen/model/eligibility";
import {
  baseDropIntentAttrs as modelBaseDropIntentAttrs,
  dragIntentAt as modelDragIntentAt,
  canDragCard,
  dropIntentAttrs as modelDropIntentAttrs,
} from "./screen/model/screenDragIntents";
import { decisionAllowsPick as modelDecisionAllowsPick, nextDecisionPicks } from "./screen/model/decisionPicks";
import { preselectedAttackTargets } from "./screen/model/attackTargetPrompt";
import {
  gameOverReason as modelGameOverReason,
  gameOverResult as modelGameOverResult,
  revealedZones as modelRevealedZones,
  viewerTurnOrder as modelViewerTurnOrder,
} from "./screen/model/gameOutcome";
import { actionGuards } from "./screen/model/actionGuards";
import { dropZoneAt } from "./screen/dropZones";
import {
  handEntriesOf,
  sortedHandInstanceIds,
  retainHandOrder,
  reorderedHandInstanceIds,
} from "./screen/model/handEntries";
import { useAutoHatch } from "./screen/hooks/useAutoHatch";
import { useBotMatchStartDeadline } from "./screen/hooks/useBotMatchStartDeadline";
import { clientErrorReporter } from "@/clientErrors/clientErrorReporter";
import { ClientErrorKind } from "@aegis/shared/clientErrors/ClientErrorKind";
import { useHandAutoSort } from "./handAutoSort";
import { setHandSortMode, useHandSortMode, type HandSortMode } from "./handSortMode";
import type { HandSortDirection } from "@/game/HandSortDirection";
import { setHandSortDirection, useHandSortDirection } from "@/game/handSortDirectionPreference";
import { dnaFieldChoice, dnaMaterialPicks, toggleDnaMaterial } from "./screen/model/dnaMaterialSelection";
import { presentedSeats } from "./screen/model/presentedSeats";
import { visibleBoard } from "./screen/model/visibleBoard";
import { appFusionLive } from "./screen/model/appFusionLive";
import { memoryPreviewInputs } from "./screen/model/memoryPreviewInputs";
import { spotlightRequest } from "./screen/model/spotlightRequest";
import { triggerDetailsFor } from "./screen/model/triggerDetails";
import { combatAnswers } from "./screen/combatAnswers";
import { playChoiceAnswers } from "./screen/playChoiceAnswers";
import type { DropZoneHit, PermanentChrome } from "./screen/types";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SeriesDeckDialogProps } from "@/game/overlay/match/SeriesDeckDialog";
import type { DeckFormat } from "@aegis/shared/deckFormat";
import {
  CardKind,
  PRESENTATION_CHANNEL,
  ANIMATION_SPEED_CHANNEL,
  type AnimationSpeedReport,
  SERIES_CHANNEL,
  getCardDefinition,
  type DecisionResponse,
  type Permanent,
  type Seat,
} from "@aegis/shared";
import { rejectionMessage } from "../rejectionMessages";
import { useTranslation } from "../i18n";
import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { intents } from "../net/intents";
import { useRoom, type MatchMode, type SeriesGameTicket, type UseRoomResult } from "../net/useRoom";
import { seriesView } from "./seriesModel";
import { getRematchView } from "@/game/getRematchView";
import { singleServerBatch, type ServerBatch } from "../net/serverBatches";
import { selectPresentedState, type StateSnapshot } from "../net/presentedState";
import { joinWithBot } from "../net/client";
import type { StartMode } from "../screens/Lobby";
import type { AegisJoinOptions } from "../net/types";
import { type Screen } from "../design/primitives";
import type { DigimonWorldAvatarId } from "../account/avatars";
import type { ColorName } from "../design/theme";
import { playSound } from "../design/sound";
import { useTurnAttentionSound } from "./useTurnAttentionSound";
import { useDecisionPing } from "@/game/useDecisionPing";
import { resolveDecisionPromptKeys } from "@/game/resolveDecisionPromptKeys";
import { isDecisionPingEnabled } from "@/design/decisionPing";
import { useLowTimeWarning } from "@/game/useLowTimeWarning";
import { usePresentationAudio, useReadoutAudio } from "./usePresentationAudio";
import { audioBoardFromPresentedSeats } from "./match/present/presentationAudio";
import { cardConfirmationPreference } from "@/game/cardConfirmation/cardConfirmationPreference";
import { isKeepAwakeEnabled } from "../design/keepAwake";
import { useScreenWakeLock } from "../design/useScreenWakeLock";
import { useArenaBoardLook } from "./arenaLook";
import "./game.css";
import "./arena.css";
import "./arenaMobile.css";
import { Side } from "./side";
import { type DropTarget } from "./dragIntents";
import {
  bothSeated,
  attackTargetIdsOf,
  canAttackPlayerWith,
  displayMemory,
  otherSeat,
  viewerSeatOf,
  breedingSlotClickAction,
} from "./boardModel";
import { openCombatWindow, mirroredCombatWindow } from "./combatWindowModel";
import { buildInstanceIndex, instancePermanentId } from "./decisionModel";
import { digivolveBasePermanentIds } from "./digivolveModel";
import { useMatchLogHistory } from "@/game/log/useMatchLogHistory";
import { TutorialCoach } from "@/game/tutorial/TutorialCoach";
import { findTutorialLesson } from "@aegis/shared/tutorial/findTutorialLesson";
import { getSeatNames } from "@/game/log/getSeatNames";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import { useMatchCues } from "./useMatchCues";
import { useAnimationSpeedReport } from "./useAnimationSpeedReport";
import type { PresentationPacing, PresentationProbe } from "./presentationProbe";
import { TIMINGS } from "./timings";
import { loadReconnectSession } from "../net/reconnectSession";
import { pendingFateBadges } from "./pendingFate";
import { useEffectConfirmationHold } from "./effectConfirmationHold";
import { findEffectSourceMarks } from "@/game/effectMarks/findEffectSourceMarks";

export type SeriesDeckPickerParams = Pick<
  SeriesDeckDialogProps,
  "format" | "unlimited" | "betaAllowed" | "onChoose" | "onClose"
>;

const SERIES_HOP_DELAY_MS = 1500;

export function GameScreen(props: Omit<Parameters<typeof GameScreenSession>[0], "liveConnection">) {
  const {
    joinOptions,
    startMode = "casual",
    roomCode,
    spectatorFriendId,
    waitForHost,
    betaBattleMode,
    unlimited,
    presentationPacing,
    seriesGame,
    tournamentMatch,
    demoConnection,
    replayMode,
  } = props;
  const [spectating] = useState(
    () => replayMode || startMode === "spectator" || (!demoConnection && loadReconnectSession()?.spectator === true),
  );
  const matchConfig = useMemo(() => {
    if (startMode === "spectator") return { mode: "spectator" as const, roomCode, spectatorFriendId, tournamentMatch };
    if (seriesGame) return { mode: "series" as const, seriesGame };
    if (startMode === "casual" || startMode === "unlimited" || startMode === "ranked" || startMode === "beta")
      return undefined;
    if (startMode === "bot") return { mode: "bot" as MatchMode };
    return { mode: startMode, roomCode, waitForHost };
  }, [startMode, roomCode, spectatorFriendId, waitForHost, seriesGame, tournamentMatch]);
  const roomOptions = useMemo(
    () => ({
      ...joinOptions,
      spectator: spectating,
      ranked: startMode === "ranked",
      unlimited:
        startMode === "unlimited" ||
        ((startMode === "bot" || startMode === "private_host" || startMode === "private_guest") && unlimited === true),
      betaBattleMode: startMode === "beta" || (startMode === "bot" && betaBattleMode === true),
      presentationPacing,
    }),
    [joinOptions, startMode, betaBattleMode, unlimited, presentationPacing, spectating],
  );
  const liveConnection = useRoom(roomOptions, matchConfig, demoConnection !== undefined);
  const onPrivateRoomReady = props.onPrivateRoomReady;
  useEffect(() => {
    if (startMode === "private_host" && liveConnection.roomCode) {
      onPrivateRoomReady?.(liveConnection.roomCode);
    }
  }, [startMode, liveConnection.roomCode, onPrivateRoomReady]);
  return (
    <GameScreenSession
      key={`${(demoConnection ?? liveConnection).room?.roomId ?? "preview"}:${(demoConnection?.state ?? liveConnection.state)?.rollbackRevision ?? 0}`}
      {...props}
      liveConnection={liveConnection}
    />
  );
}

function GameScreenSession({
  liveConnection,
  joinOptions,
  roomCode,
  seriesGame,
  startMode = "casual",
  botDeckId,
  botSettings,
  onExit,
  onStartLesson,
  onRematch,
  onCopyUsedDeck,
  onResetScenario,
  signedIn = false,
  autoHatchReady = true,
  demoConnection,
  replayMode = false,
  historyEvents,
  replayPlayers,
  devProbe,
  presentationPacing,
  onSeriesNext,
  onLeaveForfeitsChange,
  renderSeriesDeckPicker,
}: {
  liveConnection: UseRoomResult;
  joinOptions: AegisJoinOptions;
  identityColor: ColorName;
  identityAvatarId?: DigimonWorldAvatarId | null;
  identityAvatarUrl?: string | null;
  startMode?: StartMode;
  roomCode?: string;
  tournamentMatch?: TournamentSpectateTarget;
  spectatorFriendId?: string;
  onPrivateRoomReady?: (code: string) => void;
  /** A guest returning to a private room waits until the host has reopened it. */
  waitForHost?: boolean;
  /** Famous-deck preset the seated bot should play; absent means the server picks at random. */
  botDeckId?: string;
  botSettings?: BotSettings;
  betaBattleMode?: boolean;
  unlimited?: boolean;
  onExit: (screen: Screen) => void;
  onStartLesson?: (lessonId: string) => void;
  onCopyUsedDeck?: (deck: DeckListing) => void;
  /** Restart a server-backed development scenario from the match controls. */
  onResetScenario?: () => void;
  /** Receives the private room code, so a private match can return to its room. */
  onRematch?: (
    privateRoomCode?: string,
    unlimited?: boolean,
    privateHost?: boolean,
    format?: import("@aegis/shared").DeckFormat,
    gameMode?: GameMode,
  ) => void;
  /** Only shapes what the report dialog says about follow-up questions; reporting needs no account. */
  signedIn?: boolean;
  /** Automated hatching waits for the current account’s preferences to load. */
  autoHatchReady?: boolean;
  demoConnection?: Pick<
    UseRoomResult,
    "room" | "status" | "state" | "events" | "decision" | "acknowledgeDecision" | "error" | "sessionId" | "roomCode"
  > & {
    /** Canonical keyword names mapped to printed parameters in the visual demo. */
    keywordLabels?: Readonly<Record<string, Readonly<Record<string, string>>>>;
    respondDecision?: (response: DecisionResponse) => void;
    acknowledgeBlockWindow?: (blockerPermanentId?: string) => void;
    /** A fabricated connection has no server batches; its whole event list is one moment. */
    batches?: readonly ServerBatch[];
    /** No snapshots either, so the board it shows is always its live state. */
    snapshots?: readonly StateSnapshot[];
  };
  /** Portable file playback uses the read-only board without live result dialogs. */
  replayMode?: boolean;
  historyEvents?: readonly ServerEvent[];
  replayPlayers?: readonly string[];
  /** Dev inspector hooks (the effects lab): queue controls, step events, batches, decisions. */
  devProbe?: PresentationProbe;
  presentationPacing?: PresentationPacing;
  /** A later game of a best-of-three: join it by this seat instead of matchmaking. */
  seriesGame?: SeriesGameTicket;
  /** The series opened its next game; the caller remounts this screen on that ticket. */
  onSeriesNext?: (ticket: SeriesGameTicket) => void;
  /**
   * Receives a way to concede while leaving would forfeit a live match, and `undefined` once it
   * would not. Conceding keeps the player on the result so they can still keep the replay.
   * Must be a stable callback.
   */
  onLeaveForfeitsChange?: (concede: (() => void) | undefined) => void;
  renderSeriesDeckPicker?: (params: SeriesDeckPickerParams) => ReactNode;
}) {
  const { t } = useTranslation();
  const getCardName = useTranslatedCardName();
  const [handOrder, setHandOrder] = useState<readonly string[]>([]);
  const [spectating] = useState(
    () => replayMode || startMode === "spectator" || (!demoConnection && loadReconnectSession()?.spectator === true),
  );
  const usedDeck = spectating ? undefined : liveConnection.usedDeck;
  const cardConfirmationMode = cardConfirmationPreference.useMode();
  const arenaLayout = useArenaLayout();
  const { narrowGameLayout, compactPiles, shortBoard, collapseNotices } = arenaLayout;
  const {
    room: connectedRoom,
    status,
    state,
    events,
    batches,
    decision,
    acknowledgeDecision,
    error,
    sessionId,
    roomCode: hostRoomCode,
    snapshots,
  } = demoConnection ?? liveConnection;
  const room = spectating ? undefined : connectedRoom;

  // Holds the "Game 2 · X goes first" line on screen for a beat before the room hop.
  const nextSeriesRoomId = !spectating && state?.series?.phase === "starting" ? state.series.nextRoomId : "";
  const { seriesSeat } = liveConnection;
  const onSeriesNextRef = useRef(onSeriesNext);
  onSeriesNextRef.current = onSeriesNext;
  useEffect(() => {
    if (!nextSeriesRoomId || !seriesSeat) return;
    const hop = setTimeout(
      () => onSeriesNextRef.current?.({ roomId: nextSeriesRoomId, ...seriesSeat }),
      SERIES_HOP_DELAY_MS,
    );
    return () => clearTimeout(hop);
  }, [nextSeriesRoomId, seriesSeat]);
  // A demo or showcase fabricates events with no batch boundary of their own, so its list
  // is presented as the one moment it describes.
  const cueBatches = useMemo(() => batches ?? [singleServerBatch(events)], [batches, events]);
  // Not memoized on `state`: Colyseus mutates that one object in place, so a seat filled after the
  // first sync (the first player to reach a later series game, Discord 1557352131416035499) would
  // stay cached as the fallback seat 0.
  const viewerSeat = viewerSeatOf(state, sessionId);
  const chat = useMatchChat({ room: connectedRoom, viewerSeat, spectating });
  const guestApproval = spectating ? undefined : getGuestApprovalView({ state, sessionId });

  const leaveForfeits =
    !demoConnection && !spectating && !!state && bothSeated(state) && !state.gameOver && !guestApproval;
  useEffect(() => {
    if (!leaveForfeits || !onLeaveForfeitsChange) return;
    onLeaveForfeitsChange(() => {
      if (connectedRoom) intents.surrender(connectedRoom);
    });
    return () => onLeaveForfeitsChange(undefined);
  }, [leaveForfeits, onLeaveForfeitsChange, connectedRoom]);

  const vsBot = startMode === "bot";
  const effectConfirmationHold = useEffectConfirmationHold();
  const isPrivateMatch = startMode === "private_host" || startMode === "private_guest" || !!state?.roomCode;

  const botCalledRef = useRef(false);
  const [botError, setBotError] = useState<string>();
  useEffect(() => {
    if (!vsBot || botCalledRef.current || !room || status !== "connected") return;
    botCalledRef.current = true;
    void joinWithBot(room.roomId, botDeckId, botSettings).catch((botJoinError: unknown) => {
      console.error("[BOT_JOIN_CLIENT] failed", {
        roomId: room.roomId,
        error: botJoinError instanceof Error ? botJoinError.message : String(botJoinError),
      });
      setBotError(t("game.botConnectionFailedDetail"));
    });
  }, [vsBot, room, status, botDeckId, botSettings, t]);
  useBotMatchStartDeadline({
    waiting: vsBot && !botError && (status === "connecting" || status === "connected") && !bothSeated(state),
    onExpired: () => {
      clientErrorReporter.capture({
        kind: ClientErrorKind.ERROR.value,
        error: new Error(`Bot match did not start before the deadline (status ${status})`),
      });
      setBotError(t("game.botConnectionFailedDetail"));
    },
  });

  const selectionState = useBoardSelection({ state, viewerSeat });
  const {
    handSel,
    setHandSel,
    handPreview,
    setHandPreview,
    selPerm,
    setSelPerm,
    linkSel,
    setLinkSel,
    vortexMode,
    setVortexMode,
    clearSel,
    clearDeclarations,
  } = selectionState;
  const overlayState = useOverlayState({
    decision,
    state,
    handPreview,
    setHandPreview,
    clearSel,
    clearDeclarations,
    viewerSeat,
  });
  const {
    cardMenu,
    setCardMenu,
    stackView,
    setStackView,
    picks,
    setPicks,
    decisionAsDialog,
    setZoomCardId,
    setZoomArtId,
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
  } = overlayState;
  useEffect(() => {
    if (decision?.seat !== viewerSeat) return;
    const preselected = preselectedAttackTargets(decision);
    if (preselected.length > 0) setPicks(preselected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision?.decisionId]);
  // A play leaves the hand visually at the same instant the intent is dispatched. The
  // synchronized state will confirm that departure; a rejection rolls it back.
  const [optimisticPlayedInstanceId, setOptimisticPlayedInstanceId] = useState<string>();
  const playAttemptEventSeqRef = useRef(-1);
  /** The combat-prompt window this seat already answered, so a slow round trip or a window the
   * server closed without its own resolved event cannot leave a stale prompt clickable a second
   * time. Cleared when the window is genuinely gone. */
  const answeredCombatWindowKeyRef = useRef<string | undefined>(undefined);
  /** The last combat-answer rejection already rolled back, so one refusal clears the optimistic
   * hide exactly once. */
  const rolledBackRejectionSeqRef = useRef<number | undefined>(undefined);
  const [counterHandChoice, setCounterHandChoice] = useState<{
    windowKey: string;
    instanceId: string;
    targetPermanentId?: string;
  }>();
  const [allianceConfirmation, setAllianceConfirmation] = useState<{
    windowKey: string;
    permanentId: string;
  }>();
  const allianceConfirmationSubmittedRef = useRef(false);
  const [blockConfirmation, setBlockConfirmation] = useState<{
    windowKey: string;
    permanentId: string;
  }>();
  const blockConfirmationSubmittedRef = useRef(false);

  const { drag, dragHover, handleTapRef, handleDropRef, canDragRef, startHandDrag, startPermDrag, cancelDrag } =
    useDragPlumbing({ manual: state?.gameMode === GameMode.MANUAL.value });
  canDragRef.current = null;
  const playDragStarted = drag?.kind === DragKind.Play && drag.started;
  useEffect(() => {
    if (playDragStarted && handPreview) clearSel();
  }, [playDragStarted, handPreview, clearSel]);

  const boardRef = useRef<HTMLDivElement | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const { scale: arenaScale } = arenaAppearancePreference.useAppearance();
  const fittedWidths = useFittedCardWidths({
    fieldRef,
    enabled: arenaLayout.landscapePhone && arenaScale === ArenaUiScale.DEFAULT.value,
    permanentWidth: arenaLayout.arenaPermanentWidth,
    pileWidth: arenaLayout.arenaPileWidth,
  });
  const arenaPermanentWidth = fittedWidths.permanentWidth;
  const arenaPileWidth = fittedWidths.pileWidth;
  const layout = { ...arenaLayout, arenaPermanentWidth, arenaPileWidth };
  const permRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // Where each permanent last stood, in board coordinates. A deletion is narrated after
  // the board has already dropped the permanent, so the burst needs the last measurement
  // rather than the (gone) element.
  const permCentersRef = useRef<Record<string, { x: number; y: number }>>({});
  const permFacesRef = useRef<Record<string, FieldShatterFace>>({});
  // The card that was standing at each position, kept for the same reason: the
  // shatter is drawn from the deleted card's own art, after the board dropped it.
  const permCardIdsRef = useRef<Record<string, string>>({});
  const yourSecRef = useRef<HTMLDivElement | null>(null);
  const oppSecRef = useRef<HTMLDivElement | null>(null);
  const yourDeckRef = useRef<HTMLDivElement | null>(null);
  const oppDeckRef = useRef<HTMLDivElement | null>(null);
  const yourHandDockRef = useRef<HTMLDivElement | null>(null);
  const oppHandStripRef = useRef<HTMLDivElement | null>(null);
  const attackPreviewTargetRef = useRef<{ security: boolean; permanentId?: string }>({ security: false });
  const anchors: BoardAnchors = {
    board: boardRef,
    field: fieldRef,
    permanents: permRefs,
    permanentCenters: permCentersRef,
    permanentCardIds: permCardIdsRef,
    viewerSecurity: yourSecRef,
    opponentSecurity: oppSecRef,
    viewerDeck: yourDeckRef,
    opponentDeck: oppDeckRef,
    viewerHandDock: yourHandDockRef,
    opponentHandStrip: oppHandStripRef,
  };
  const arrow = useAttackPreviewArrow({
    attackerPermanentId: selPerm,
    state,
    boardRef,
    permanentRefs: permRefs,
    opponentSecurityRef: oppSecRef,
    targetRef: attackPreviewTargetRef,
  });

  // Which hand card the pointer is over, so the memory gauge can trace where a
  // play would put memory before the card is even picked up.
  const [hoveredHandInstanceId, setHoveredHandInstanceId] = useState<string | undefined>(undefined);
  // The hand card a refusal belongs to. The server's `actionRejected` names the
  // intent and the reason, not the card, so the card is the one this client last
  // sent a play for — the only thing that could have been refused.
  const [shakeHandInstanceId, setShakeHandInstanceId] = useState<string | undefined>(undefined);
  // The Digimon whose digivolution cards a source pick is narrowed to. Keyed by the
  // decision, so the next decision starts back at choosing a Digimon.
  const [chosenSourceHost, setChosenSourceHost] = useState<{ decisionId: string; permanentId: string }>();
  const lastPlayAttemptRef = useRef<string | undefined>(undefined);
  // Measured boxes of the permanents a target prompt is offering, for the mask.

  // Declared before `cues` because the cue hook reports rejections through it;
  // both bodies only run once the other binding exists.
  const ping = (message: string) => {
    playSound("error");
    cues.raiseRejection(message);
    const offending = lastPlayAttemptRef.current;
    if (!offending) return;
    setShakeHandInstanceId(offending);
    // The class is what plays the shake, so it is taken off once the keyframes
    // are done; a second refusal on the same card re-adds it and restarts them.
    setTimeout(
      () => setShakeHandInstanceId((current) => (current === offending ? undefined : current)),
      TIMINGS.cardShake,
    );
  };

  // A block/counter/alliance/evade/barrier window is a question for this seat exactly like a
  // `pendingDecision` is, but it answers through its own intent rather than the decision
  // channel — computed here, ahead of `cues`, purely as the barrier's input signal (the actual
  // per-kind payloads used to render the overlays are derived again below). The two can never
  // both require a combat answer at once. An accepted Counter may retain its window while
  // its effect asks a normal decision; that decision takes priority for the barrier below.
  const openCombatWindowForBarrier = state ? openCombatWindow(events, state, viewerSeat) : null;
  useEffect(() => {
    if (!openCombatWindowForBarrier?.key.startsWith("counter:")) setCounterHandChoice(undefined);
  }, [openCombatWindowForBarrier?.key]);
  // The server's own record of the window still awaiting this seat's answer. Authoritative for
  // whether a prompt may be shown: the opening event can be missed entirely (broadcast while the
  // socket was down) or fall out of the capped live log, and an optimistic local hide can outlive
  // an answer the server refused.
  const mirroredWindow = state ? mirroredCombatWindow(state, viewerSeat) : null;
  const decisionPendingForViewer = decision?.seat === viewerSeat && decision.kind !== "mulligan";
  const viewerQuestionPending = decisionPendingForViewer || openCombatWindowForBarrier !== null;

  // Every cue the server provokes: sounds, panels, banners, the security clash,
  // the draw flights. The hook sequences them on the animation queue; this
  // component only renders what it reports.
  const cues = useMatchCues({
    snapshots,
    batches: cueBatches,
    phaseEvents: events,
    state,
    viewerSeat,
    mulliganOpen: decision?.kind === "mulligan",
    // The portrait phone folds both narration corners into one centred slot.
    collapseNarration: collapseNotices,
    // A security check the server stopped to ask the viewer something cannot close until it
    // is answered, so the cue sequence needs to know a question is waiting.
    decisionPending: viewerQuestionPending,
    // The barrier catches the presentation up to the board the question was asked about
    // before the prompt opens. An older server sends no revision, and no barrier is raised.
    decisionStateVersion: decisionPendingForViewer
      ? decision.stateVersion
      : (openCombatWindowForBarrier?.stateVersion ?? undefined),
    ...(decisionPendingForViewer && decision.sourceCardId ? { decisionSourceCardId: decision.sourceCardId } : {}),
    targetDecision:
      decisionPendingForViewer &&
      isFieldTargetDecision(
        decision,
        [...(state?.players ?? [])].flatMap((player) => [...player.battleArea]),
      )
        ? decision
        : undefined,
    anchors: {
      board: boardRef,
      permanentCenter: (permanentId) => permCentersRef.current[permanentId],
      permanentCardId: (permanentId) => permCardIdsRef.current[permanentId],
      permanentStack: (id) =>
        resolveFieldDepartureFace({
          id,
          cached: permFacesRef.current[id],
          elements: permRefs.current,
          board: boardRef.current,
          includeStack: true,
        }),
      permanentFace: (id) =>
        resolveFieldDepartureFace({
          id,
          cached: permFacesRef.current[id],
          elements: permRefs.current,
          board: boardRef.current,
        }),
      attackArrowClock: (permanentId, key) => readAttackArrowClock({ board: boardRef.current, key, permanentId }),
      yourDeck: yourDeckRef,
      oppDeck: oppDeckRef,
      yourHandDock: yourHandDockRef,
      oppHandStrip: oppHandStripRef,
      yourSecurity: yourSecRef,
      oppSecurity: oppSecRef,
    },
    onActionRejected: (reason) => ping(rejectionMessage(reason, t)),
    onPresentationReport: (report) => {
      room?.send(PRESENTATION_CHANNEL, { ...report, rollbackRevision: room.state.rollbackRevision });
    },
    devProbe,
    presentationPacing,
    holdEffectsForConfirmation: vsBot && !spectating && effectConfirmationHold,
  });
  const liveChat = connectedRoom ? chat : undefined;
  const chatWindow = useMatchChatWindow({
    chat: liveChat,
    resultShown: !!state?.gameOver && !cues.resultPending,
  });
  const you = state?.players[viewerSeat];
  const opp = state?.players[otherSeat(viewerSeat)];
  const viewerCardArtKey =
    spectating || !state
      ? ""
      : collectViewerCardArtIds({ deck: joinOptions.deck, players: [...state.players], viewerSeat }).join("\n");
  const viewerCardArtIds = useMemo(() => new Set(viewerCardArtKey.split("\n").filter(Boolean)), [viewerCardArtKey]);
  /**
   * The two boards this screen reads (docs/presentation-queue-plan.md 3.2).
   *
   * `state` is the live synchronized state and is the ONLY thing legality is read off:
   * what may be played, what may be attacked, which decision is open. `shownState` is the
   * board the presentation has reached — the snapshot at the revision of the batch the
   * queue is narrating — and drives the field, piles and gauge. Hands follow confirmed
   * server changes independently of narration, except during the turn-start draw hold.
   * They are the same object whenever the queue is caught up.
   */
  const shownState = selectPresentedState({
    live: state,
    snapshots: snapshots ?? [],
    presentedStateVersion: cues.presentedStateVersion,
  });

  const seats =
    shownState && you && opp
      ? presentedSeats({
          shownState,
          viewer: you,
          opponent: opp,
          viewerSeat,
          heldPhaseState: cues.heldPhaseState,
          heldBlowState: cues.heldBlowState,
          heldSecurityEffectState: cues.heldSecurityEffectState,
          heldDrawState: cues.heldDrawState,
          heldBreedingState: cues.heldBreedingState,
          heldDeletions: cues.heldDeletions,
          heldStackStrips: cues.heldStackStrips,
          heldTrashArrivals: cues.heldTrashArrivals,
          heldHandArrivals: cues.heldHandArrivals,
          optimisticPlayedInstanceId,
          presentationPacing,
        })
      : undefined;
  usePresentationAudio(cues, seats ? audioBoardFromPresentedSeats(seats, viewerSeat) : undefined);
  useScreenWakeLock(isKeepAwakeEnabled() && !!state && !state.gameOver);
  useTurnAttentionSound(!spectating && !!state && !state.gameOver && state.turnSeat === viewerSeat);
  const lowTimeWarning = useLowTimeWarning({ state, viewerSeat, spectating });
  const viewerTimerRunning =
    !spectating && state?.matchTimer === true && !state.gameOver && state.timerActiveSeat === viewerSeat;
  const viewerPromptKey = cues.decisionAnimationsPending
    ? undefined
    : decisionPendingForViewer
      ? decision.decisionId
      : openCombatWindowForBarrier?.key;
  const sendAnimationSpeed = useMemo(
    () => (room ? (report: AnimationSpeedReport) => room.send(ANIMATION_SPEED_CHANNEL, report) : undefined),
    [room],
  );
  useAnimationSpeedReport({ enabled: !spectating, send: sendAnimationSpeed });
  const { readoutPromptKey, pingPromptKey } = resolveDecisionPromptKeys({
    promptKey: viewerPromptKey,
    spectating,
    opponentTurn: !!state && state.turnSeat !== viewerSeat,
    pingEnabled: isDecisionPingEnabled(),
  });
  useDecisionPing(pingPromptKey);
  useReadoutAudio({
    memory: shownState
      ? displayMemory(
          {
            turnSeat: cues.heldMemory?.turnSeat ?? shownState.turnSeat,
            memory: cues.heldMemory?.memory ?? shownState.memory,
          },
          viewerSeat,
        )
      : undefined,
    promptKey: readoutPromptKey,
    timerSeconds: viewerTimerRunning
      ? Math.ceil(viewerSeat === 0 ? state.timerRemaining0 : state.timerRemaining1)
      : undefined,
  });
  const devProbeRef = useRef(devProbe);
  devProbeRef.current = devProbe;
  useEffect(() => {
    devProbeRef.current?.onDecision?.(decision);
  }, [decision]);
  useEffect(() => {
    const onBoard = devProbeRef.current?.onBoard;
    if (!state || !onBoard) return;
    const displayed =
      selectPresentedState({
        live: state,
        snapshots: snapshots ?? [],
        presentedStateVersion: cues.presentedStateVersion,
      }) ?? state;
    const visible = visibleBoard({
      live: state,
      displayed,
      viewerSeat,
      cues,
      optimisticPlayedInstanceId,
      presentationPacing,
    });
    if (visible) onBoard({ live: state, displayed, visible, viewerSeat });
  }, [state, state?.stateVersion, snapshots, cues, viewerSeat, optimisticPlayedInstanceId, presentationPacing]);
  const {
    combatImpactIds,
    fieldClash,
    deckRiffles,
    effectSources,
    dpPulses,
    dpBadgeSuppressedIds,
    freezePulses,
    phaseBanner,
    pendingPermanentIds,
    permanentBursts,
    optionBranch,
    securityBranch,
    securityBreak,
    securityClash,
    turnTransition,
    unsuspendSweep,
    zoneShowcase,
    revealShowcase,
  } = cues;
  const playGameCue = cues.playCue;

  /**
   * The unsuspend phase sweeps a board rather than snapping it: each slot starts its
   * rotation a little after the one before it. Both boards participate: Reboot turns
   * cards on the other board during this same phase. Outside the sweep an attack turns immediately.
   */
  const unsuspendStagger = (index: number) => (unsuspendSweep ? index * TIMINGS.suspendStagger : 0);

  const trackingArrow = useTrackingArrow({
    state,
    events,
    decision,
    picks,
    viewerSeat,
    fieldClash,
    securityClash,
    phasePresentationPending:
      cues.phaseTransitionPending || cues.attackAwaitingCause || phaseBanner !== null || turnTransition !== null,
    effectSelection: effectSources
      .flatMap((source) =>
        source.targetPermanentIds && source.site.zone === "field"
          ? [{ sourcePermanentId: source.site.permanentId, targetPermanentIds: source.targetPermanentIds }]
          : [],
      )
      .at(-1),
    boardRef,
    permRefs,
    permCentersRef,
    viewerSecurityRef: yourSecRef,
    opponentSecurityRef: oppSecRef,
  });

  /* The activation moment for an effect fired from a zone rather than a card on
     the field: the trash pile lifts the physical source, the hand raises the Option.
     Which zone the source is in comes from the board (`effectSource.ts`), not from
     the event, which names only the card. */
  /* An activation outlives its own punch: it stays on for as long as the clause it raised is
     being read (`effectSource.ts`). A permanent glows in place. Hand and trash sources
     keep their physical face raised through reading; the trash completes its final
     shrink as reading begins. The clause releases their visual copies. */
  const announcing = effectSources.filter((activation) => activation.linked !== true);
  const trashEffectSource = (seat: Seat): string | undefined =>
    announcing.some((activation) => activation.seat === seat && activation.site.zone === "trash")
      ? "game-pile--effect-source"
      : undefined;
  const handEffectSourceInstanceId = announcing.find(
    (activation) => activation.seat === viewerSeat && activation.site.zone === "hand",
  )?.site;
  const handSources = effectSources.filter(
    (activation) => activation.seat === viewerSeat && activation.site.zone === "hand",
  );
  const handEffectSource = handSources.find((activation) => activation.linked !== true) ?? handSources.at(-1);
  /* Two states, never both on one card: the half-second punch as the effect activates, and
     the steady light it holds for as long as its clause is on screen. Overlapping them
     would leave two animations fighting over the same filter. */
  const effectSourcePermanentIds = new Set(
    announcing.flatMap((activation) =>
      activation.site.zone === "field" ? [activation.site.permanentId, ...(activation.targetPermanentIds ?? [])] : [],
    ),
  );
  const effectLinkedPermanentIds = new Set(
    effectSources.flatMap((activation) =>
      activation.linked === true && activation.site.zone === "field" ? [activation.site.permanentId] : [],
    ),
  );

  if (state?.gameMode === GameMode.MANUAL.value && state.manual.signalSeat !== -1) {
    if (state.manual.signalPermanentId) {
      effectLinkedPermanentIds.add(state.manual.signalPermanentId);
    }
    if (state.manual.signalTargetPermanentId) {
      effectLinkedPermanentIds.add(state.manual.signalTargetPermanentId);
    }
  }

  const arenaLook = useArenaBoardLook({ viewer: you, opponent: opp, matchKey: connectedRoom?.roomId });

  // A play written into a dropping socket can be lost without the server ever refusing it, so a
  // reconnect rolls the hide back: the resumed state alone says whether the card left the hand.
  useEffect(() => {
    if (status === "reconnecting") setOptimisticPlayedInstanceId(undefined);
  }, [status]);

  useEffect(() => {
    if (!optimisticPlayedInstanceId) return;
    const stillInHand = you?.hand?.some((card) => card.instanceId === optimisticPlayedInstanceId) ?? false;
    if (!stillInHand) {
      const presented =
        presentationPacing === "sequential"
          ? selectPresentedState({
              live: state,
              snapshots: snapshots ?? [],
              presentedStateVersion: cues.presentedStateVersion,
            })
          : state;
      const shownHand =
        cues.heldDrawState?.seat === viewerSeat
          ? cues.heldDrawState.state.players[viewerSeat]?.hand
          : presented?.players[viewerSeat]?.hand;
      // A confirmed play may already be absent live while its flight still holds an older
      // hand snapshot. Keep the existing hide until that snapshot also releases the card.
      if (shownHand?.some((card) => card.instanceId === optimisticPlayedInstanceId)) return;
      setOptimisticPlayedInstanceId(undefined);
      return;
    }
    const rejected = events.some(
      (event, index) =>
        event.kind === "actionRejected" &&
        event.intent === "playCard" &&
        (event.seq ?? index) > playAttemptEventSeqRef.current,
    );
    if (rejected) setOptimisticPlayedInstanceId(undefined);
  }, [
    events,
    optimisticPlayedInstanceId,
    you,
    state,
    snapshots,
    cues.presentedStateVersion,
    cues.heldDrawState,
    viewerSeat,
    presentationPacing,
  ]);

  const { spotlightRequestRef, spotlightSubjects, boardSize } = useBoardMeasurements({
    viewer: you,
    opponent: opp,
    boardRef,
    fieldRef,
    permRefs,
    permCentersRef,
    permFacesRef,
    permCardIdsRef,
    opponentSecurityRef: oppSecRef,
  });

  useAutoHatch({
    room,
    state,
    viewer: you,
    viewerSeat,
    ready: autoHatchReady && status === "connected" && !!state && bothSeated(state),
    decisionOpen: Boolean(decision || state?.pendingDecision),
    presenting: cues.presenting,
    phasePresentationPending: cues.phaseTransitionPending || turnTransition !== null || phaseBanner !== null,
  });

  // ----- pre-match / connection gates -----
  const presentedHand = seats?.handHeld ? seats.shownHand : you?.hand;
  const presentedHandKey = presentedHand?.map((card) => `${card.instanceId}\u0001${card.cardId}`).join("\0");
  const handAutoSort = useHandAutoSort();
  const handSortMode = useHandSortMode();
  const handSortDirection = useHandSortDirection();
  useEffect(() => {
    if (presentedHandKey === undefined) return;
    const hand = presentedHandKey.split("\0").map((card) => {
      const [instanceId = "", cardId = ""] = card.split("\u0001");
      return { instanceId, cardId };
    });
    setHandOrder((order) =>
      handAutoSort ? sortedHandInstanceIds(hand, handSortMode, handSortDirection) : retainHandOrder(order, hand),
    );
  }, [presentedHandKey, handAutoSort, handSortMode, handSortDirection]);

  const instanceIndex = state ? buildInstanceIndex(state, viewerSeat) : new Map<string, string>();
  const playerName0 = state?.players[0]?.displayName;
  const playerName1 = state?.players[1]?.displayName;
  const seatNames = useMemo(
    () =>
      getSeatNames({
        players: [{ displayName: playerName0 }, { displayName: playerName1 }],
        viewerSeat: spectating ? undefined : viewerSeat,
        replayPlayers,
        t,
      }),
    [playerName0, playerName1, spectating, viewerSeat, replayPlayers, t],
  );
  const playerAvatar0 = state?.players[0]?.avatarId;
  const playerAvatar1 = state?.players[1]?.avatarId;
  const seatAvatars = useMemo(
    () => ({ 0: playerAvatar0 || undefined, 1: playerAvatar1 || undefined }),
    [playerAvatar0, playerAvatar1],
  );
  const {
    turns: logTurns,
    recent: log,
    entries: logEntries,
  } = useMatchLogHistory({
    events: historyEvents ?? events,
    initialTurn: state
      ? { turnCount: Math.max(1, state.turnCount), turnSeat: state.turnSeat, phase: state.phase }
      : undefined,
    batches: historyEvents ? undefined : batches,
    resetKey: `${connectedRoom?.roomId ?? "preview"}:${liveConnection.rollbackCount}`,
    viewerSeat,
    seatNames,
    instanceIndex,
    t,
  });

  if (
    status === "reconnecting" ||
    status === "error" ||
    (status === "closed" && !state?.gameOver) ||
    botError ||
    !state ||
    !you ||
    !opp ||
    !shownState ||
    !seats ||
    !bothSeated(state) ||
    guestApproval
  ) {
    const pendingSeries = state && viewerSeat !== undefined ? seriesView(state.series, viewerSeat) : undefined;
    const notice =
      pendingSeries?.stage === "over"
        ? {
            title: t(pendingSeries.outcome === "win" ? "overlay.series.won" : "overlay.series.drawn"),
            detail: t(
              pendingSeries.endReason === "forfeit"
                ? "overlay.series.reason.opponentLeft"
                : "overlay.series.reason.aborted",
              { name: t("game.opponent") },
            ),
            spinner: false,
            actionLabel: t("game.returnToLobby"),
            exitTo: "lobby" as const,
            roomCode: undefined,
          }
        : seriesGame && status === "connected"
          ? { title: t("overlay.series.joining"), detail: "", spinner: true, roomCode: undefined }
          : pendingMatchNotice({
              status,
              botError,
              error,
              vsBot,
              spectating,
              hasOpponent: !!state && bothSeated(state),
              startMode,
              hostRoomCode,
              joinOptions,
              guestApproval,
              t,
            });
    const guestRequest = guestApproval?.kind === "hostReview" ? guestApproval.guest : undefined;
    return (
      <PendingMatchBoard
        title={notice.title}
        detail={notice.detail}
        spinner={notice.spinner}
        actionLabel={notice.actionLabel}
        roomCode={notice.roomCode}
        guestRequest={guestRequest}
        onAnswerGuest={
          guestRequest
            ? (accept) => room?.send(GUEST_APPROVAL_CHANNEL, { guestSessionId: guestRequest.sessionId, accept })
            : undefined
        }
        status={
          "searchingQueue" in notice && notice.searchingQueue ? (
            <MatchQueueActivity
              className="waiting-dialog__queue-activity"
              viewerQueued
              selection={getMatchQueueSelection({
                options: {
                  ...joinOptions,
                  ranked: startMode === "ranked",
                  betaBattleMode: startMode === "beta",
                  unlimited: startMode === "unlimited" || joinOptions.unlimited,
                },
              })}
            />
          ) : undefined
        }
        onAction={notice.exitTo ? () => onExit(notice.exitTo!) : undefined}
        onCancel={() => onExit("lobby")}
      />
    );
  }

  const {
    shownViewer: shownYou,
    shownOpponent: shownOpp,
    breedingViewer: breedingYou,
    breedingOpponent: breedingOpp,
    shownHand,
    shownHandCount,
    shownOpponentHandCount,
    handHeld,
  } = seats;
  // What the ribbons have announced, for the readouts only: the live turn is what every
  // guard below reads, and what `isMyTurn` must keep meaning.
  const displayedTurnSeat = cues.displayedTurn?.seat ?? shownState.turnSeat;
  const displayedTurnCount = cues.displayedTurn?.count ?? shownState.turnCount;
  const guards = actionGuards({
    spectating,
    state,
    viewer: you,
    viewerSeat,
    decisionOpen: Boolean(decision || state.pendingDecision),
    presenting: cues.presenting,
    phasePresentationPending: cues.phaseTransitionPending || turnTransition !== null || phaseBanner !== null,
  });
  const { isMyTurn, mainActionBlocked, breedingWindow, canHatchEgg, canMoveOutOfBreeding, breedingActionsOpen } =
    guards;
  // The gauge is part of the scene, so it moves when the moment that moved it is narrated.
  // A held gauge keeps the side it was read from as well as its number: `state.memory` is
  // signed from the turn player's side, and an effect that takes the turn player's last
  // memory also ends the turn, which would otherwise flip the gauge before its clause read.
  const memory = displayMemory(
    {
      turnSeat: cues.heldMemory?.turnSeat ?? shownState.turnSeat,
      memory: cues.heldMemory?.memory ?? shownState.memory,
    },
    viewerSeat,
  );

  const { handEntries, shownHandEntries } = handEntriesOf({
    handOrder,
    viewer: you,
    shownHand,
    handHeld,
    optimisticPlayedInstanceId,
  });
  const dnaChoosing = actionConfirm?.kind === "dna";
  const dnaPicks = dnaMaterialPicks(actionConfirm, overlayState.dnaMaterialSelection);
  const dnaChoice = dnaFieldChoice(
    handEntries.find((entry) => entry.instanceId === actionConfirm?.instanceId)?.dnaDigivolveRoutes ?? [],
    you.battleArea,
    dnaPicks,
  );
  const toggleDnaPick = (permanentId: string) => {
    if (!dnaChoosing || !dnaChoice.candidates.has(permanentId)) return;
    overlayState.setDnaMaterialSelection({
      action: actionConfirm,
      permanentIds: toggleDnaMaterial(dnaPicks, permanentId),
    });
  };
  const digivolveRoutesOf = (instanceId: string) => modelDigivolveRoutesOf({ handEntries, instanceId });
  const selEntry = handSel ? handEntries.find((h) => h.instanceId === handSel) : undefined;
  const selCardId = selEntry?.cardId;
  const selDef = selCardId ? getCardDefinition(selCardId) : undefined;
  const handPreviewEntry = handPreview ? shownHandEntries.find((entry) => entry.instanceId === handPreview) : undefined;
  const handPreviewActions =
    handPreview && !decision && !mainActionBlocked
      ? handEntries.find((entry) => entry.instanceId === handPreview)
      : undefined;

  const selection = { clearSel, setHandSel, setHandPreview, setSelPerm, setVortexMode, setLinkSel };
  const overlayControls = {
    setCardMenu,
    setStackView,
    setPicks,
    setDualPlay,
    setActionConfirm,
    setAssemblyPick,
    setDigiXrosPick,
    setEvoCostChoice,
  };
  const matchSenders = matchIntents({
    room,
    localConnection: demoConnection,
    decision,
    acknowledgeDecision,
    events,
    viewer: you,
    opponent: opp,
    handEntries,
    digivolveRoutesOf,
    mainActionBlocked,
    cardConfirmationMode,
    playGameCue,
    lastPlayAttemptRef,
    playAttemptEventSeqRef,
    setOptimisticPlayedInstanceId,
    selection,
    overlays: overlayControls,
  });
  const { dispatchPlayCard, playCard, linkCard, attack, digivolveWithChoice } = matchSenders;

  const combatWindows = combatWindowsFor({
    events,
    state,
    viewerSeat,
    isMyTurn,
    mirroredWindow,
    decision,
    openCombatWindow: openCombatWindowForBarrier,
    answeredCombatWindowKeyRef,
    rolledBackRejectionSeqRef,
  });
  const allianceWindowKey = combatWindows.allianceWindow
    ? `alliance:${combatWindows.allianceWindow.permanentId}:${combatWindows.allianceWindow.stateVersion ?? state.stateVersion}`
    : undefined;
  const activeAllianceConfirmationPermanentId =
    allianceConfirmation &&
    allianceConfirmation.windowKey === allianceWindowKey &&
    combatWindows.allianceWindow?.eligibleAllyIds.includes(allianceConfirmation.permanentId)
      ? allianceConfirmation.permanentId
      : undefined;
  const blockWindowKey = combatWindows.blockWindow
    ? `block:${combatWindows.blockWindow.attackerPermanentId}:${openCombatWindowForBarrier?.stateVersion ?? state.stateVersion}`
    : undefined;
  const activeBlockConfirmationPermanentId =
    blockConfirmation &&
    blockConfirmation.windowKey === blockWindowKey &&
    combatWindows.blockWindow?.eligibleBlockerIds.includes(blockConfirmation.permanentId)
      ? blockConfirmation.permanentId
      : undefined;
  const { markCombatWindowAnswered } = combatWindows;
  const counterWindowKey = `${openCombatWindowForBarrier?.key ?? ""}:${openCombatWindowForBarrier?.stateVersion ?? ""}`;
  const counterSourceInstanceId =
    counterHandChoice?.windowKey === counterWindowKey ? counterHandChoice.instanceId : undefined;
  const selectCounterSource = (instanceId?: string) => {
    setHandPreview(null);
    setCounterHandChoice(instanceId ? { windowKey: counterWindowKey, instanceId } : undefined);
  };
  const counterHandInstanceIds = (you.hand ?? []).map((card) => card.instanceId);
  const eligibleCounterHandIds =
    combatWindows.counterWindow?.eligibleCounters
      .filter((choice) => counterHandInstanceIds.includes(choice.instanceId))
      .map((choice) => choice.instanceId) ?? [];
  const counterSourceChoices =
    combatWindows.counterWindow?.eligibleCounters.filter((choice) => choice.instanceId === counterSourceInstanceId) ??
    [];
  const { fieldSourceByPermanent: counterFieldSources, mustPickSource: counterMustPickSource } = counterSources({
    eligibleCounters: combatWindows.counterWindow?.eligibleCounters ?? [],
    handInstanceIds: counterHandInstanceIds,
    fieldPermanentOf: (instanceId) => instancePermanentId(state, instanceId),
  });
  const counterPickableFieldSourceOf = (permanentId: string) =>
    counterMustPickSource ? counterFieldSources.get(permanentId) : undefined;
  const counterHostIds = new Set(
    counterSourceChoices.flatMap((choice) => {
      const target = counterTargetIds(choice.effectKey);
      return target ? [target.permanentId] : [];
    }),
  );

  // ----- eligibility helpers -----
  // Every "can I do this?" answer below is the server's, read off the state it already
  // projects (CardInstance.digivolveTargetPermanentIds / Permanent.attackablePermanentIds).
  // The client renders affordances; it does not re-derive the rules behind them.
  const handIsDigi = selDef?.kinds.includes(CardKind.Digimon) ?? false;

  const digivolveTargetsOf = (instanceId: string | undefined) => modelDigivolveTargetsOf({ handEntries, instanceId });

  const linkTargetsOfPermanent = (perm: Permanent) => modelLinkTargetsOfPermanent({ isMyTurn, perm });

  const appFusionHostIdsOf = (instanceId: string | undefined) =>
    modelAppFusionHostIdsOf({ handEntries, you, instanceId });

  const eligibleBase = (perm: Permanent) => modelEligibleBase({ handEntries, you, handSel, perm });
  const dragCardId = drag && drag.started ? drag.cardId : undefined;
  const dragIsPlay = drag?.kind === DragKind.Play && drag.started;

  const canReorderHand = (instanceId: string) =>
    !spectating &&
    !dnaChoosing &&
    !handHeld &&
    !decision &&
    !state.pendingDecision &&
    !state.combatWindow &&
    !cues.presenting &&
    !state.gameOver &&
    shownHandEntries.some((entry) => entry.instanceId === instanceId) &&
    handEntries.some((entry) => entry.instanceId === instanceId);
  const canDragGameAction = (candidate: NonNullable<typeof drag>) =>
    !dnaChoosing &&
    !mainActionBlocked &&
    (candidate.kind !== DragKind.Attack || (!handSel && !linkSel)) &&
    (state.gameMode === GameMode.MANUAL.value || canDragCard({ drag: candidate, you, handEntries }));
  const dragIntentAt = (hit: DropZoneHit | null) => {
    if (drag?.started && hit?.target === "hand-you" && drag.kind === DragKind.Play && canReorderHand(drag.instanceId))
      return "reorder" as const;
    return drag && canDragGameAction(drag) ? modelDragIntentAt({ hit, drag, you, handEntries }) : null;
  };

  const dropIntentAttrs = (target: DropTarget, id?: string) =>
    modelDropIntentAttrs({ target, id, drag, you, handEntries });

  const hoveredDragIntent = dragIntentAt(dragHover);

  // The bases in the battle area the card in the air would digivolve onto. Releasing it on
  // any other permanent plays it, which the battle row underneath already offers, so only
  // these permanents mark themselves — a Tamer never among them.
  const dragBasePermanentIds = new Set(
    dragIsPlay && drag
      ? [
          ...digivolveBasePermanentIds(
            drag.cardId,
            you.battleArea,
            digivolveTargetsOf(drag.instanceId),
            handEntries.find((entry) => entry.instanceId === drag.instanceId)?.dnaDigivolveRoutes,
          ),
          ...appFusionHostIdsOf(drag.instanceId),
        ]
      : [],
  );

  const baseDropIntentAttrs = (permanentId: string) =>
    modelBaseDropIntentAttrs({ permanentId, dragBasePermanentIds, drag, you, handEntries });
  /** An App Fusion is an ordinary Main-phase action, so it follows the same guard. */
  const appFusionActionAvailable = () => !mainActionBlocked;
  const actions = boardActions({
    state,
    shownState,
    viewer: you,
    room,
    t,
    handEntries,
    handSel,
    selPerm,
    selCardId,
    linkSel,
    vortexMode,
    isMyTurn,
    mainActionBlocked,
    breedingActionsOpen,
    permanentRefs: permRefs,
    ping,
    playGameCue,
    selection,
    overlays: overlayControls,
    setAppFusionChoice,
    playCard,
    attack,
    linkCard,
    digivolveWithChoice,
    digivolveTargetsOf,
    appFusionHostIdsOf,
    eligibleBase,
    linkTargetsOfPermanent,
  });
  const { findPermanent, handleTap, handleDrop, onYourPerm, onBreeding } = actions;
  handleTapRef.current = handleTap;
  handleDropRef.current = (candidate, x, y) => {
    const hit = dropZoneAt(x, y);
    if (hit?.target === "hand-you" && candidate.kind === DragKind.Play) {
      if (canReorderHand(candidate.instanceId))
        setHandOrder(reorderedHandInstanceIds(shownHandEntries, candidate.instanceId, hit.id));
      return;
    }
    if (canDragGameAction(candidate)) handleDrop(candidate, x, y);
  };
  canDragRef.current = (candidate) =>
    (candidate.kind === DragKind.Play && canReorderHand(candidate.instanceId)) || canDragGameAction(candidate);
  const combatWindowAnswers = combatAnswers({
    room,
    acknowledgeBlockWindowLocally: demoConnection?.acknowledgeBlockWindow,
    markAnswered: markCombatWindowAnswered,
  });

  // ----- log + game over -----

  const gameOverReason = modelGameOverReason({ events });

  const gameOverResult: "win" | "loss" | "draw" = modelGameOverResult({
    events,
    viewerSeat,
    winnerSeat: state.winnerSeat,
  });

  const viewerTurnOrder = modelViewerTurnOrder({ events, viewerSeat });

  const revealed = modelRevealedZones({ events, viewerSeat, resultShown: state.gameOver && !cues.resultPending });

  const rematch = spectating ? undefined : getRematchView({ series: state.series, viewerSeat });
  const series = spectating || rematch?.stage === "accepted" ? undefined : seriesView(state.series, viewerSeat);

  const attackerPerm = selPerm ? you.battleArea.find((p) => p.permanentId === selPerm) : undefined;
  const draggedAttackerPerm =
    drag?.kind === DragKind.Attack ? you.battleArea.find((p) => p.permanentId === drag.permanentId) : undefined;
  const canAttackSecurity = canAttackPlayerWith(attackerPerm, vortexMode);
  attackPreviewTargetRef.current = {
    security: canAttackSecurity,
    permanentId: canAttackSecurity ? undefined : attackTargetIdsOf(attackerPerm, vortexMode)[0],
  };

  const allPermanents = [...you.battleArea, ...opp.battleArea];
  const handInstanceIds = handEntries.map((entry) => entry.instanceId);
  const decisionView = decisionViewFor({
    decision,
    decisionAnimationsPending: cues.decisionAnimationsPending,
    decisionAsDialog,
    viewerSeat,
    events,
    state,
    instanceIndex,
    permanents: allPermanents,
    breedingPermanents: [you.breeding, opp.breeding].filter((permanent) => permanent !== undefined),
    handInstanceIds,
  });
  const fieldDecision =
    decisionView.answerOnBoard &&
    (decisionView.viewerDecision?.kind === "selectCards" || decisionView.viewerDecision?.kind === "chooseTargets") &&
    (decisionView.viewerDecision.options?.selectionContext === "attackTarget" ||
      decisionView.decisionVisible.some(
        (candidate) => candidate.zone === "battle" || candidate.zone === "opponentBattle",
      ));
  const decisionCandidateIdFor = (perm: Permanent) =>
    [perm.topCard.instanceId, perm.permanentId].find((id) => decisionView.decisionSelectable.has(id));
  const {
    viewerDecision,
    decisionHighlightPermanentId,
    decisionBreedingSourcePermanentId,
    decisionSelectable,
    decisionVisibleCardIds,
    decisionInstanceColors,
    decisionDifferentColors,
    decisionDistinctCardIds,
    decisionDistinctNames,
    decisionAllowedTargetCombinations,
    decisionMaxTotalPlayCost,
    decisionMaxTotalDP,
    decisionCandidateDP,
    decisionMax,
  } = decisionView;

  // Keep the asking card lit after its notice closes, until the decision is answered.
  // A finite activation flash takes precedence over the steady source halo.
  if (
    decisionHighlightPermanentId &&
    viewerDecision?.options?.selectionContext !== "attackTarget" &&
    !effectSourcePermanentIds.has(decisionHighlightPermanentId)
  ) {
    effectLinkedPermanentIds.add(decisionHighlightPermanentId);
  }

  // CR 4-24-2: a multicolor card only needs one color no other pick uses, so the
  // picks stay legal as long as a distinct color can still be assigned to each.
  const decisionAllowsPick = (instanceId: string) =>
    modelDecisionAllowsPick({
      decisionSelectable,
      instanceId,
      picks,
      decisionInstanceColors,
      decisionDifferentColors,
      decisionVisibleCardIds,
      decisionDistinctCardIds,
      decisionDistinctNames,
      decisionAllowedTargetCombinations,
      decisionMaxTotalPlayCost,
      decisionMaxTotalDP,
      decisionCandidateDP,
      decisionMax,
    });

  const decisionAllowsPermanent = (perm: Permanent) => {
    const candidateId = decisionCandidateIdFor(perm);
    return candidateId !== undefined && decisionAllowsPick(candidateId);
  };

  const toggleDecisionPick = (instanceId: string) => {
    if (!decisionAllowsPick(instanceId)) return;
    setPicks((current) => nextDecisionPicks({ picks: current, instanceId, max: decisionMax }));
  };
  const sourceHostChoice = sourceHostChoiceFor({
    decision: viewerDecision,
    answerOnBoard: decisionView.answerOnBoard,
    candidates: decisionView.decisionVisible,
    battleArea: allPermanents,
  });
  const explicitlyChosenSourceHostId =
    sourceHostChoice !== undefined &&
    chosenSourceHost !== undefined &&
    chosenSourceHost.decisionId === viewerDecision?.decisionId &&
    sourceHostChoice.cardIdsByHost.has(chosenSourceHost.permanentId)
      ? chosenSourceHost.permanentId
      : undefined;
  const onlySourceHostId =
    sourceHostChoice?.hostPermanentIds.length === 1 ? sourceHostChoice.hostPermanentIds[0] : undefined;
  const chosenSourceHostId = explicitlyChosenSourceHostId ?? onlySourceHostId;
  const pickingSourceHost = sourceHostChoice !== undefined && chosenSourceHostId === undefined;
  const chooseSourceHost = (permanentId: string | undefined) => {
    if (decisionMax === 1) setPicks([]);
    setChosenSourceHost(
      viewerDecision && permanentId ? { decisionId: viewerDecision.decisionId, permanentId } : undefined,
    );
  };
  const securityDecisionTargetId =
    fieldDecision && decisionView.viewerDecision?.options?.selectionContext === "attackTarget"
      ? (["player", "opponent"].find((id) => decisionSelectable.has(id)) ?? undefined)
      : undefined;
  // What the resolving effect will do to each target the viewer has picked. The
  // fate is the server's own projection (`options.targetFate`); a prompt that
  // carries none badges nothing.
  const fateBadges = pendingFateBadges({ decision: viewerDecision, picks, viewerSeat });

  const spotlight = spotlightRequest({
    breedingWindow,
    linkSel,
    selPerm,
    attackerPerm,
    vortexMode,
    handSel,
    handIsDigi,
    viewer: you,
    handEntries,
    canAttackSecurity,
  });
  spotlightRequestRef.current = spotlight;

  const { memoryPrediction } = memoryPreviewInputs({
    memory,
    dragIsPlay,
    drag,
    dragHover,
    hoveredDragIntent,
    hoveredHandInstanceId,
    handSel,
    handEntries,
    viewer: you,
    opponent: opp,
  });

  const triggerDetails = triggerDetailsFor({
    decision: viewerDecision,
    viewer: you,
    opponent: opp,
    handInstanceIds: shownHandEntries.map((entry) => entry.instanceId),
    t,
    getCardName,
  });
  const effectSourceMarks = findEffectSourceMarks({
    events,
    presentedStateVersion: cues.presentedStateVersion,
    viewerDecision,
  });
  const trashChrome = (seat: Seat): string | undefined => {
    const trash = seat === viewerSeat ? shownYou.trash : shownOpp.trash;
    const marked = trash.some((card) => effectSourceMarks.has(card.instanceId));
    return (
      [trashEffectSource(seat), marked ? "game-pile--effect-marked" : undefined].filter(Boolean).join(" ") || undefined
    );
  };

  const appFusion = appFusionLive({
    choice: appFusionChoice,
    handEntries,
    viewer: you,
    available: appFusionActionAvailable(),
  });
  const playAnswers = playChoiceAnswers({
    playNormally: (instanceId, confirmDrop) => matchSenders.playCard(instanceId, confirmDrop, false, true),
    room,
    viewer: you,
    handEntries,
    mainActionBlocked,
    appFusionAvailable: appFusionActionAvailable,
    dualPlay,
    actionConfirm,
    appFusionChoice,
    appFusionRoutes: appFusion,
    evoCostChoice,
    assemblyPick,
    digiXrosPick,
    overlays: overlayControls,
    setAppFusionChoice,
    clearSel,
    playGameCue,
    lastPlayAttemptRef,
    dispatchPlayCard,
    digivolveWithChoice,
    findPermanent,
  });
  const cardMenuPermanent = cardMenu ? findPermanent(cardMenu.permanentId) : undefined;
  const stackViewPermanent = stackView ? findPermanent(stackView) : undefined;
  const stageEl = typeof document !== "undefined" ? document.getElementById("aegis-stage") : null;
  // One physical raising area moves into the utility row on a portrait screen.
  const yourBreedingDock = (
    <BreedingDock
      eggDeckCount={breedingYou.eggDeckCount}
      breeding={breedingYou.breeding}
      keywordLabels={
        breedingYou.breeding ? demoConnection?.keywordLabels?.[breedingYou.breeding.permanentId] : undefined
      }
      pileWidth={arenaLayout.arenaRaisingWidth}
      compactPiles={compactPiles}
      burst={breedingYou.breeding ? permanentBursts.get(breedingYou.breeding.permanentId) : undefined}
      effectSource={!!breedingYou.breeding && effectSourcePermanentIds.has(breedingYou.breeding.permanentId)}
      effectLinked={!!breedingYou.breeding && effectLinkedPermanentIds.has(breedingYou.breeding.permanentId)}
      highlight={!!breedingYou.breeding && decisionBreedingSourcePermanentId === breedingYou.breeding.permanentId}
      eggDeckRiffling={deckRiffles.get(`${viewerSeat}:eggDeck`) ?? false}
      actionsOpen={breedingActionsOpen}
      canHatchEgg={canHatchEgg}
      canMoveOut={canMoveOutOfBreeding}
      slotCandidate={
        (breedingActionsOpen && canMoveOutOfBreeding) ||
        (!!breedingYou.breeding &&
          (eligibleBase(breedingYou.breeding) ||
            (dragIsPlay && digivolveTargetsOf(drag?.instanceId).includes(breedingYou.breeding.permanentId))))
      }
      slotDrop={{ "data-drop": "breeding-you", ...dropIntentAttrs("breeding-you") }}
      onHatch={onBreeding}
      onInspect={() => {
        if (!breedingYou.breeding) {
          return;
        }
        cancelDrag();
        actions.showCardMenu(breedingYou.breeding.permanentId, Side.Viewer, { preserveSelection: true });
      }}
      onOpenEggDeck={
        revealed ? () => overlayState.setRevealedZoneView({ side: Side.Viewer, zone: "eggDeck" }) : undefined
      }
      // In the breeding step an occupied slot answers with the move itself;
      // otherwise it reads like any other own card and opens the detail menu.
      // An empty slot only answers the breeding step, once its actions open.
      onSlotClick={
        you.breeding
          ? breedingSlotClickAction({
              breedingActionsOpen,
              canMove: canMoveOutOfBreeding,
              hasPendingSelection: !!handSel || !!linkSel || selPerm === you.breeding.permanentId,
            }) === "move"
            ? onBreeding
            : onYourPerm(you.breeding)
          : breedingActionsOpen
            ? onBreeding
            : undefined
      }
    />
  );
  const tutorialLesson = spectating || replayMode ? undefined : findTutorialLesson(joinOptions.storyBattleId);
  const matchOverlays = (
    <MatchOverlays
      state={state}
      viewer={you}
      opponent={opp}
      viewerSeat={viewerSeat}
      opponentName={shownOpp.displayName || t("game.opponent")}
      decision={decision}
      decisionView={decisionView}
      allPermanents={allPermanents}
      triggerDetails={triggerDetails}
      fateBadges={fateBadges}
      allowsPick={decisionAllowsPick}
      onTogglePick={toggleDecisionPick}
      combatWindows={combatWindows}
      combatPromptsHeld={spectating || cues.decisionAnimationsPending}
      sourceHost={
        sourceHostChoice
          ? {
              picking: pickingSourceHost,
              cardIds: chosenSourceHostId ? sourceHostChoice.cardIdsByHost.get(chosenSourceHostId) : undefined,
              onChangeHost: () => chooseSourceHost(undefined),
              hostPermanentIds: sourceHostChoice.hostPermanentIds,
              onChooseHost: chooseSourceHost,
            }
          : undefined
      }
      counterSelection={{
        instanceId: counterSourceInstanceId,
        targetPermanentId: counterHandChoice?.targetPermanentId,
        onSelect: selectCounterSource,
        handInstanceIds: counterHandInstanceIds,
      }}
      combatWindowAnswers={combatWindowAnswers}
      blockConfirmationPermanentId={activeBlockConfirmationPermanentId}
      onConfirmBlock={() => {
        if (!activeBlockConfirmationPermanentId || blockConfirmationSubmittedRef.current) {
          return;
        }
        blockConfirmationSubmittedRef.current = true;
        combatWindowAnswers.onBlock(activeBlockConfirmationPermanentId);
        setBlockConfirmation(undefined);
      }}
      onCancelBlockConfirmation={() => {
        blockConfirmationSubmittedRef.current = false;
        setBlockConfirmation(undefined);
      }}
      allianceConfirmationPermanentId={activeAllianceConfirmationPermanentId}
      onConfirmAlliance={() => {
        if (!activeAllianceConfirmationPermanentId || allianceConfirmationSubmittedRef.current) return;
        allianceConfirmationSubmittedRef.current = true;
        combatWindowAnswers.onAlliance(activeAllianceConfirmationPermanentId);
        setAllianceConfirmation(undefined);
      }}
      onCancelAllianceConfirmation={() => {
        allianceConfirmationSubmittedRef.current = false;
        setAllianceConfirmation(undefined);
      }}
      scenes={{ securityBreak, securityClash, securityBranch, optionBranch, zoneShowcase, revealShowcase }}
      collapseNotices={collapseNotices}
      logTurns={logTurns}
      seatNames={seatNames}
      seatAvatars={seatAvatars}
      logViewerSeat={spectating ? undefined : viewerSeat}
      signedIn={signedIn}
      handoffUrl={
        signedIn &&
        !spectating &&
        !replayMode &&
        !tutorialLesson &&
        !demoConnection &&
        !state.gameOver &&
        viewerSeat !== undefined
          ? `${window.location.origin}/`
          : undefined
      }
      opponentDropped={!spectating && !vsBot && !opp.connected && !state.gameOver}
      gameOver={
        !replayMode && !tutorialLesson && (state.gameOver || series?.stage === "over") && !cues.resultPending
          ? {
              result: series?.outcome ?? gameOverResult,
              usedDeckName: usedDeck?.deckName,
              opponentDeckName: !spectating ? liveConnection.opponentDeck?.deckName : undefined,
              opponentDeckDialog:
                !spectating && liveConnection.opponentDeck
                  ? (onClose: () => void) => (
                      <UsedDeckDialog
                        snapshot={liveConnection.opponentDeck!}
                        onCopy={onCopyUsedDeck}
                        onClose={onClose}
                        opponent
                      />
                    )
                  : undefined,
              usedDeckDialog: usedDeck
                ? (onClose: () => void) => (
                    <UsedDeckDialog snapshot={usedDeck} onCopy={onCopyUsedDeck} onClose={onClose} />
                  )
                : undefined,
              onDownloadReplay:
                liveConnection.replayDownload?.kind === "ready"
                  ? () => {
                      if (liveConnection.replayDownload?.kind === "ready")
                        downloadReplay(liveConnection.replayDownload);
                    }
                  : undefined,
              replayFile: liveConnection.replayDownload?.kind === "ready" ? liveConnection.replayDownload : undefined,
              replayStatus:
                demoConnection || joinOptions.devScenario
                  ? undefined
                  : liveConnection.replayDownload?.kind === "unavailable"
                    ? "unavailable"
                    : liveConnection.replayDownload
                      ? undefined
                      : "preparing",
              friendMatchId: !spectating && !vsBot ? room?.roomId : undefined,
              chat: liveChat && { open: chatWindow.open, unread: chatWindow.unread, onToggle: chatWindow.toggle },
              reason: gameOverReason,
              revealed,
              series: series && {
                view: series,
                opponentName: opp.displayName || t("game.opponent"),
                onChooseTurnOrder: (goFirst) => room?.send(SERIES_CHANNEL, { action: "chooseTurnOrder", goFirst }),
                onLeave: () => room?.send(SERIES_CHANNEL, { action: "leave" }),
              },
              rematch: rematch && {
                view: rematch,
                opponentName: opp.displayName || t("game.opponent"),
                onOffer: (mode) => room?.send(SERIES_CHANNEL, { action: "offerRematch", mode }),
                onAnswer: (accept) => room?.send(SERIES_CHANNEL, { action: "answerRematch", accept }),
                onChooseTurnOrder: (goFirst) => room?.send(SERIES_CHANNEL, { action: "chooseTurnOrder", goFirst }),
                onKeepDeck: () => room?.send(SERIES_CHANNEL, { action: "chooseSeriesDeck" }),
                deckPicker: renderSeriesDeckPicker
                  ? (onClose) =>
                      renderSeriesDeckPicker({
                        format: state.format as DeckFormat,
                        unlimited: state.unlimited,
                        betaAllowed: startMode === "beta" || isPrivateMatch,
                        onChoose: (deck) =>
                          room?.send(SERIES_CHANNEL, {
                            action: "chooseSeriesDeck",
                            deck: {
                              deckId: deck.id,
                              deckName: deck.name,
                              mainDeck: deck.mainDeck,
                              eggDeck: deck.eggDeck,
                              mainDeckArts: deck.mainDeckArts,
                              eggDeckArts: deck.eggDeckArts,
                              community: deck.community,
                            },
                          }),
                        onClose,
                      })
                  : undefined,
              },
              spectatorResult: spectating
                ? state.winnerSeat < 0
                  ? t("spectator.draw")
                  : t("spectator.winner", {
                      name:
                        state.players[state.winnerSeat]?.displayName || t("log.player", { n: state.winnerSeat + 1 }),
                    })
                : undefined,
            }
          : undefined
      }
      overlays={overlayState}
      selection={selectionState}
      intents={matchSenders}
      actions={actions}
      playAnswers={playAnswers}
      appFusion={appFusion}
      handPreviewEntry={handPreviewEntry}
      handPreviewActions={handPreviewActions}
      appFusionHostIdsOf={appFusionHostIdsOf}
      cardMenuPermanent={cardMenuPermanent}
      stackViewPermanent={stackViewPermanent}
      keywordLabels={demoConnection?.keywordLabels}
      narrowGameLayout={narrowGameLayout}
      isMyTurn={isMyTurn}
      mainActionBlocked={mainActionBlocked || dnaChoosing}
      linkTargetsOfPermanent={linkTargetsOfPermanent}
      handEntries={handEntries}
      shownHandEntries={shownHandEntries}
      effectSourceMarks={effectSourceMarks}
      viewerTurnOrder={viewerTurnOrder}
      boardRef={boardRef}
      permanentRefs={permRefs}
      handDockRef={yourHandDockRef}
      onExit={onExit}
      returnsToRoom={isPrivateMatch}
      arenaDeckColors={arenaLook.deckColors}
      onRematch={
        spectating
          ? () => onExit("lobby")
          : onRematch
            ? () =>
                onRematch(
                  isPrivateMatch ? state?.roomCode || hostRoomCode || roomCode : undefined,
                  state?.unlimited,
                  isPrivateMatch ? viewerSeat === 0 : undefined,
                  state?.format as import("@aegis/shared").DeckFormat | undefined,
                  state?.gameMode,
                )
            : () => onExit("lobby")
      }
    />
  );
  const overlays = (
    <>
      {matchOverlays}
      {tutorialLesson && onStartLesson && (!state.gameOver || !cues.resultPending) ? (
        <TutorialCoach
          lesson={tutorialLesson}
          state={state}
          viewerSeat={viewerSeat}
          onStartLesson={onStartLesson}
          onLeave={() => onExit("home")}
        />
      ) : null}
    </>
  );

  /** What both battle rows put on a permanent; only the sweep's stagger differs. */
  const permanentChrome: Omit<PermanentChrome, "suspendDelayMs"> = {
    showInspectionControls:
      dnaChoosing ||
      (!state.gameOver &&
        viewerDecision !== undefined &&
        viewerDecision.kind !== "optional" &&
        viewerDecision.kind !== "mulligan"),
    keywordLabels: demoConnection?.keywordLabels,
    compact: narrowGameLayout || shortBoard,
    width: arenaPermanentWidth,
    permanentRefs: permRefs,
    effectSourcePermanentIds,
    effectLinkedPermanentIds,
    decisionHighlightPermanentId,
    decisionPickedInstanceIds: dnaChoosing ? new Set(dnaPicks) : fieldDecision ? new Set(picks) : new Set<string>(),
    materialSelectionOrder: dnaChoosing
      ? new Map(dnaChoice.orderedPicks.map((id, index) => [id, index + 1]))
      : getDecisionMaterialSelectionOrder({ allowedTargetCombinations: decisionAllowedTargetCombinations, picks }),
    permanentBursts,
    pendingPermanentIds,
    fateBadges,
    combatImpactIds,
    dpPulses,
    dpBadgeSuppressedIds,
    freezePulses,
    heldSuspendedIds: cues.heldSuspendedIds,
    heldDeletionIds: new Set([...cues.heldDeletions.values()].map((hold) => hold.permanent.permanentId)),
  };

  const board = (
    <BoardStage
      replayMode={replayMode}
      onResetScenario={onResetScenario}
      state={state}
      shownState={shownState}
      viewer={you}
      opponent={opp}
      viewerSeat={viewerSeat}
      promptSourceCardId={decision?.seat === viewerSeat ? decision.sourceCardId : undefined}
      spectating={spectating}
      onLeaveSpectator={() => onExit("lobby")}
      room={spectating ? undefined : room}
      chat={liveChat}
      chatWindow={chatWindow}
      look={arenaLook}
      layout={layout}
      anchors={anchors}
      cues={cues}
      timeWarning={lowTimeWarning}
      seats={{
        shownViewer: shownYou,
        shownOpponent: shownOpp,
        breedingViewer: breedingYou,
        breedingOpponent: breedingOpp,
        shownHandEntries,
        shownHandCount,
        shownOpponentHandCount,
        revealed,
      }}
      guards={{
        ...guards,
        mainActionBlocked: guards.mainActionBlocked || dnaChoosing,
        endPhaseBlocked: guards.endPhaseBlocked || dnaChoosing,
      }}
      readouts={{
        memory,
        memoryPrediction,
        displayedTurnSeat,
        displayedTurnCount,
        log,
        logEntries,
        seatNames,
        seatAvatars,
      }}
      targeting={{
        spotlight,
        spotlightSubjects,
        boardSize,
        previewArrow: arrow,
        trackingArrow,
        attackerPermanent: attackerPerm,
        draggedAttackerPermanent: draggedAttackerPerm,
        canAttackSecurity,
        securityDecision: securityDecisionTargetId
          ? {
              selected: picks.includes(securityDecisionTargetId),
              onToggle: () => toggleDecisionPick(securityDecisionTargetId),
            }
          : undefined,
        isBasePermanent: (perm) =>
          dnaChoosing
            ? dnaChoice.candidates.has(perm.permanentId)
            : combatWindows.counterWindow
              ? counterHostIds.has(perm.permanentId) || counterPickableFieldSourceOf(perm.permanentId) !== undefined
              : combatWindows.blockWindow
                ? combatWindows.blockWindow.eligibleBlockerIds.includes(perm.permanentId)
                : combatWindows.allianceWindow
                  ? combatWindows.allianceWindow.eligibleAllyIds.includes(perm.permanentId)
                  : pickingSourceHost
                    ? sourceHostChoice?.cardIdsByHost.has(perm.permanentId) === true
                    : fieldDecision
                      ? decisionAllowsPermanent(perm)
                      : (handIsDigi && eligibleBase(perm)) ||
                        dragBasePermanentIds.has(perm.permanentId) ||
                        (linkSel?.targetPermanentIds.includes(perm.permanentId) ?? false),
        isDecisionCandidate: (perm) =>
          (dnaChoosing && dnaChoice.candidates.has(perm.permanentId)) ||
          (combatWindows.counterWindow !== undefined && counterPickableFieldSourceOf(perm.permanentId) !== undefined) ||
          combatWindows.blockWindow?.eligibleBlockerIds.includes(perm.permanentId) === true ||
          combatWindows.allianceWindow?.eligibleAllyIds.includes(perm.permanentId) === true ||
          (pickingSourceHost && sourceHostChoice?.cardIdsByHost.has(perm.permanentId) === true) ||
          (fieldDecision && decisionAllowsPermanent(perm)),
      }}
      chrome={{
        permanentChrome,
        unsuspendStagger,
        dropIntentAttrs,
        baseDropIntentAttrs,
        trashEffectSource: trashChrome,
      }}
      handDock={{
        handSortMode,
        handSortDirection,
        onSortHand: (mode: HandSortMode, direction: HandSortDirection) => {
          setHandSortMode(mode);
          setHandSortDirection(direction);
          setHandOrder(sortedHandInstanceIds(shownHandEntries, mode, direction));
        },
        reorderDropBeforeInstanceId: hoveredDragIntent === "reorder" ? (dragHover?.id ?? null) : undefined,
        onMoveHandCard: (instanceId, direction) => {
          const index = shownHandEntries.findIndex((entry) => entry.instanceId === instanceId);
          const entry = shownHandEntries[index];
          if (!entry || !canReorderHand(instanceId)) return;
          const destination =
            direction === -1 ? shownHandEntries[index - 1]?.instanceId : shownHandEntries[index + 2]?.instanceId;
          if (index + direction < 0 || index + direction >= shownHandEntries.length) return;
          setHandOrder(reorderedHandInstanceIds(shownHandEntries, instanceId, destination));
        },
        effectSource: handEffectSource,
        effectSourceInstanceId:
          handEffectSourceInstanceId?.zone === "hand" ? handEffectSourceInstanceId.instanceId : undefined,
        effectSourceMarks,
        shakeInstanceId: shakeHandInstanceId,
        selection: dnaChoosing
          ? {
              selectableInstanceIds: [],
              pickedInstanceIds: [],
              onToggle: () => undefined,
              onInspect: (id) => setZoomCardId(handEntries.find((entry) => entry.instanceId === id)?.cardId ?? null),
            }
          : combatWindows.counterWindow
            ? {
                selectableInstanceIds: eligibleCounterHandIds,
                pickedInstanceIds: counterSourceInstanceId ? [counterSourceInstanceId] : [],
                onToggle: (instanceId) => {
                  if (eligibleCounterHandIds.includes(instanceId)) selectCounterSource(instanceId);
                },
                onInspect: setHandPreview,
              }
            : !fieldDecision &&
                decisionView.answerOnBoard &&
                (decisionView.viewerDecision?.kind === "selectCards" ||
                  decisionView.viewerDecision?.kind === "chooseTargets")
              ? {
                  selectableInstanceIds: (decisionView.viewerDecision.options?.candidateInstanceIds ?? []).filter(
                    decisionAllowsPick,
                  ),
                  pickedInstanceIds: picks,
                  onToggle: toggleDecisionPick,
                  onInspect: setHandPreview,
                }
              : undefined,
        actionBar:
          !dnaChoosing && !selPerm && !combatWindows.counterWindow && !fieldDecision
            ? {
                selCardId: handPreview ? undefined : selCardId,
                hasBase:
                  (selEntry?.digivolveTargetPermanentIds.length ?? 0) > 0 ||
                  (selEntry?.dnaDigivolveRoutes?.length ?? 0) > 0 ||
                  appFusionHostIdsOf(selEntry?.instanceId).length > 0,
                linkingCardId: linkSel?.cardId,
                onCancel: clearSel,
              }
            : undefined,
        reserveActionBarSpace: fieldDecision,
        onHoverChange: setHoveredHandInstanceId,
      }}
      selection={selectionState}
      overlays={overlayState}
      actions={
        dnaChoosing
          ? {
              ...actions,
              onYourPerm: (perm) => () => {
                if (dnaChoice.candidates.has(perm.permanentId)) toggleDnaPick(perm.permanentId);
                else setZoomCardId(perm.topCard.cardId);
              },
              onOppPerm: (perm) => () => setZoomCardId(perm.topCard.cardId),
            }
          : combatWindows.counterWindow
            ? {
                ...actions,
                onYourPerm: (perm) => () => {
                  const choices = counterSourceChoices.filter(
                    (choice) => counterTargetIds(choice.effectKey)?.permanentId === perm.permanentId,
                  );
                  const fieldSource = counterPickableFieldSourceOf(perm.permanentId);
                  if (choices.length === 1)
                    combatWindowAnswers.onCounter(choices[0]!.instanceId, choices[0]!.effectKey);
                  else if (choices.length > 1)
                    setCounterHandChoice((current) =>
                      current ? { ...current, targetPermanentId: perm.permanentId } : current,
                    );
                  else if (fieldSource) selectCounterSource(fieldSource);
                  else setZoomCardId(perm.topCard.cardId);
                },
              }
            : combatWindows.blockWindow
              ? {
                  ...actions,
                  onYourPerm: (perm) => () => {
                    if (combatWindows.blockWindow?.eligibleBlockerIds.includes(perm.permanentId) && blockWindowKey) {
                      blockConfirmationSubmittedRef.current = false;
                      setBlockConfirmation({ windowKey: blockWindowKey, permanentId: perm.permanentId });
                    } else {
                      setZoomCardId(perm.topCard.cardId);
                    }
                  },
                }
              : combatWindows.allianceWindow
                ? {
                    ...actions,
                    onYourPerm: (perm) => () => {
                      if (
                        combatWindows.allianceWindow?.eligibleAllyIds.includes(perm.permanentId) &&
                        allianceWindowKey
                      ) {
                        allianceConfirmationSubmittedRef.current = false;
                        setAllianceConfirmation({ windowKey: allianceWindowKey, permanentId: perm.permanentId });
                      } else setZoomCardId(perm.topCard.cardId);
                    },
                  }
                : pickingSourceHost
                  ? {
                      ...actions,
                      onYourPerm: (perm) => () => {
                        if (sourceHostChoice?.cardIdsByHost.has(perm.permanentId)) chooseSourceHost(perm.permanentId);
                        else setZoomCardId(perm.topCard.cardId);
                      },
                      onOppPerm: (perm) => () => {
                        if (sourceHostChoice?.cardIdsByHost.has(perm.permanentId)) chooseSourceHost(perm.permanentId);
                        else setZoomCardId(perm.topCard.cardId);
                      },
                    }
                  : fieldDecision
                    ? {
                        ...actions,
                        onYourPerm: (perm) => () => {
                          const candidateId = decisionCandidateIdFor(perm);
                          if (candidateId && (picks.includes(candidateId) || decisionAllowsPick(candidateId)))
                            toggleDecisionPick(candidateId);
                          else actions.onYourPerm(perm)?.();
                        },
                        onOppPerm: (perm) => () => {
                          const candidateId = decisionCandidateIdFor(perm);
                          if (candidateId && (picks.includes(candidateId) || decisionAllowsPick(candidateId)))
                            toggleDecisionPick(candidateId);
                          else actions.onOppPerm(perm)?.();
                        },
                      }
                    : actions
      }
      senders={matchSenders}
      drag={{ state: drag, isPlay: dragIsPlay, cardId: dragCardId, hoveredIntent: hoveredDragIntent ?? undefined }}
      breedingDock={yourBreedingDock}
      overlayStack={overlays}
      stageEl={stageEl}
      onStartHandDrag={(index, event, origin) => startHandDrag(index, shownHandEntries[index], event, origin)}
      onStartPermanentDrag={startPermDrag}
      onInspectPermanent={{
        viewer: (perm) => {
          cancelDrag();
          if (state.gameMode === GameMode.MANUAL.value && !spectating) {
            setHandSel(null);
            setSelPerm(perm.permanentId);
            return;
          }
          actions.showCardMenu(perm.permanentId, Side.Viewer, { preserveSelection: true });
        },
        opponent: (perm) => {
          cancelDrag();
          actions.showCardMenu(perm.permanentId, Side.Opponent, { preserveSelection: true });
        },
      }}
      onOpenCard={(cardId, artId) => {
        setZoomCardId(cardId);
        setZoomArtId(artId);
      }}
    />
  );
  return <ViewerCardArtIdsContext.Provider value={viewerCardArtIds}>{board}</ViewerCardArtIdsContext.Provider>;
}
