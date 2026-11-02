import { CardMovePosition } from "@aegis/shared/protocol/CardMovePosition";
import { useLayoutEffect, useMemo, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { GameState, Seat, ServerEvent } from "@aegis/shared";
import { Phase } from "@aegis/shared/schema/enums";
import type { AnimationQueue, AnimationStep, AnimationStepContext } from "../../animationQueue";
import type { SoundKind } from "../../../design/sound";
import type { StateSnapshot } from "../../../net/presentedState";
import type { NarrationItem } from "../../narration";
import type { ServerBatch } from "../../../net/serverBatches";
import { isAnnouncedPhase, phaseBannerFrom, type PhaseBanner } from "../../phaseBanner";
import { PRESENTED_BOARD_BUDGET_MS } from "../../presentationProgress";
import { TIMINGS } from "../../timings";
import { waitForPaintedAnimation } from "../../paintedAnimationClock";
import { Side } from "../../side";
import { UNSUSPEND_PHASE, UNSUSPEND_SWEEP_MS } from "../constants";
import { CueTrack } from "../enums";
import { OPTION_DOCK_TRACKS } from "../tracks";
import { buildInstanceSeatIndex } from "../../sidePanels";
import type { DrawPhaseOwner, MatchCues, TurnTransitionCue, UnsuspendSweep } from "../types";

/**
 * The phase and turn ribbons, and everything the board holds back while one is on screen.
 *
 * Raw events, rather than batch closes, own the phase clock: the server closes each batch
 * only after sending its resulting state patch, so a ribbon keyed on the close would arrive
 * after the board it is meant to introduce.
 *
 * A ribbon waits for three things before it takes the screen — the batches of the events
 * before it, the cues those batches queued ahead of it, and one readable beat for a clause it
 * is about to cover. All three are bounded by the same budget: a batch that keeps arriving
 * must never hold the ribbon for good.
 *
 * The hold is the other half. From the Unsuspend ribbon the presented board freezes at the
 * previous revision, so the draw the turn opens with stays hidden until its own Draw banner,
 * and the suspended cards stay suspended until the sweep runs. Draw, Breeding and Main each
 * release part of it, and a cancelled or non-live ribbon releases all of it at once.
 */
/** The held board with every listed permanent — battle area or breeding — turned upright. */
function releaseUnsuspended(player: GameState["players"][number], unsuspended: ReadonlySet<string>) {
  return {
    ...player,
    battleArea: player.battleArea.map((permanent) =>
      unsuspended.has(permanent.permanentId) && permanent.isSuspended
        ? { ...permanent, isSuspended: false }
        : permanent,
    ),
    ...(player.breeding && unsuspended.has(player.breeding.permanentId) && player.breeding.isSuspended
      ? { breeding: { ...player.breeding, isSuspended: false } }
      : {}),
  } as GameState["players"][number];
}

/**
 * The held board with every hand move that happened before the turn began.
 *
 * The hold starts from the last rendered revision, and a patch that flips the turn often
 * also carries the previous turn's last effect — an [On Deletion] that returned a card to
 * hand. Only the turn's own draw belongs behind the Draw banner, so those earlier moves are
 * applied to the held hand now instead of waiting for it.
 */
export function releaseHandMoves({
  held,
  live,
  moves,
}: {
  held: GameState;
  live: GameState | undefined;
  moves: readonly ServerEvent[];
}): GameState {
  const heldSeats = buildInstanceSeatIndex(held);
  const liveSeats = live ? buildInstanceSeatIndex(live) : new Map<string, Seat>();
  const players = held.players.map((player) => ({ ...player, hand: [...(player.hand ?? [])] }));
  for (const move of moves) {
    if (move.kind !== "cardsMoved" || (move.to === "hand" && move.from === "hand")) continue;
    // A move the held revision already shows was rendered before the turn flipped.
    if ("stateVersion" in move && typeof move.stateVersion === "number" && move.stateVersion < held.stateVersion)
      continue;
    for (const instanceId of move.instanceIds) {
      const seat =
        (move.to === "hand" ? move.seat : (move.fromSeat ?? move.seat)) ??
        heldSeats.get(instanceId) ??
        liveSeats.get(instanceId);
      if (seat === undefined) continue;
      const player = players[seat];
      if (!player) continue;
      const inHeldHand = player.hand.some((card) => card.instanceId === instanceId);
      const handFullyVisible = player.hand.length === player.handCount;
      if (move.to === "hand") {
        if (inHeldHand) continue;
        const card = live?.players[seat]?.hand?.find((candidate) => candidate.instanceId === instanceId);
        if (card) player.hand.push(card);
        player.handCount += 1;
        if (move.from === "deck") player.deckCount = Math.max(0, player.deckCount - 1);
      } else {
        // An effect play names no origin ("various"): only a card the held hand still shows
        // left the hand. A named origin other than the hand never touches it.
        if (move.from !== "hand" && (move.from !== CardMovePosition.VARIOUS.value || !inHeldHand)) continue;
        if (!inHeldHand && handFullyVisible) continue;
        player.hand = player.hand.filter((card) => card.instanceId !== instanceId);
        player.handCount = Math.max(0, player.handCount - 1);
      }
    }
  }
  return { ...held, players } as GameState;
}

export function usePhaseBanners({
  batches,
  phaseEvents,
  eventTimeline,
  viewerSeat,
  queue,
  phaseOrdersRef,
  nextPhaseOrderRef,
  completedPhaseOrderRef,
  stepPhaseOrdersRef,
  lastPhaseEventRef,
  phaseBaselineRef,
  visiblePhaseBannerRef,
  drawPhaseWaitingRef,
  previousDrawStateRef,
  phaseStateRef,
  state,
  presentedStateVersion,
  setPendingPhaseBanners,
  setTurnTransition,
  setAnnouncedTurn,
  setAnnouncedPhase,
  setPhaseBanner,
  setHeldDrawState,
  setHeldPhaseState,
  setHeldBreedingState,
  setHeldSuspendedIds,
  setUnsuspendSweep,
  playCue,
  narrationBefore,
}: {
  batches: readonly ServerBatch[];
  /** A fabricated preview may deliver its phase events apart from its batches. */
  phaseEvents: readonly ServerEvent[] | undefined;
  eventTimeline: readonly ServerEvent[];
  viewerSeat: Seat;
  queue: AnimationQueue;
  /** Mutated: which ribbon each phase event belongs to, pruned as the log is rewritten. */
  phaseOrdersRef: MutableRefObject<Map<ServerEvent, number>>;
  /** Mutated: the last ribbon number handed out. */
  nextPhaseOrderRef: MutableRefObject<number>;
  /** Mutated: the last ribbon that finished, which is what a cue is ordered against. */
  completedPhaseOrderRef: MutableRefObject<number>;
  stepPhaseOrdersRef: MutableRefObject<WeakMap<AnimationStep, number>>;
  /** Mutated: the phase event the previous pass ended at. */
  lastPhaseEventRef: MutableRefObject<Extract<ServerEvent, { kind: "phaseChanged" | "turnEnded" }> | undefined>;
  /** Mutated: false until the first pass has recorded the history it joined mid-match. */
  phaseBaselineRef: MutableRefObject<boolean>;
  /** Mutated: true while a ribbon is on screen. */
  visiblePhaseBannerRef: MutableRefObject<boolean>;
  /** Mutated: the seat whose hand is frozen until its Draw banner. */
  drawPhaseWaitingRef: MutableRefObject<DrawPhaseOwner | null>;
  previousDrawStateRef: MutableRefObject<GameState | undefined>;
  phaseStateRef: MutableRefObject<{ events: readonly ServerEvent[]; snapshots: readonly StateSnapshot[] | undefined }>;
  /** The live state, which names the cards a hand move put in the viewer's hand. */
  state: GameState | undefined;
  presentedStateVersion: number | undefined;
  setPendingPhaseBanners: Dispatch<SetStateAction<number>>;
  setTurnTransition: Dispatch<SetStateAction<TurnTransitionCue | null>>;
  setAnnouncedTurn: Dispatch<SetStateAction<{ seat: Seat; count: number } | undefined>>;
  setAnnouncedPhase: Dispatch<SetStateAction<GameState["phase"] | undefined>>;
  setPhaseBanner: Dispatch<SetStateAction<PhaseBanner | null>>;
  setHeldDrawState: Dispatch<SetStateAction<{ seat: Seat; state: GameState } | undefined>>;
  setHeldPhaseState: Dispatch<SetStateAction<GameState | undefined>>;
  setHeldBreedingState: Dispatch<SetStateAction<MatchCues["heldBreedingState"]>>;
  setHeldSuspendedIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
  setUnsuspendSweep: Dispatch<SetStateAction<UnsuspendSweep | null>>;
  playCue: (kind: SoundKind) => void;
  narrationBefore: (phaseOrder: number) => NarrationItem[];
}) {
  const phaseBannerKeyRef = useRef(0);
  const unsuspendSweepKeyRef = useRef(0);
  const appliedUnsuspendSeqRef = useRef(-1);
  const appliedUnsuspendsRef = useRef(new WeakSet<ServerEvent>());
  /** The Unsuspend phase whose ribbon has not released that phase's moves yet. */
  const unreleasedUnsuspendPhaseRef = useRef<ServerEvent | undefined>(undefined);

  /**
   * Release permanents whose unsuspend move reaches the client after the Unsuspend ribbon
   * already read the timeline. The engine unsuspends only once the triggers pending from the
   * previous turn have resolved, which can be many seconds into the Active phase, so the
   * ribbon's one-shot read finds nothing and the held board keeps them rotated until Main
   * lifts the hold. A move is applied once: by identity, and by seq so that a log rewrite
   * cannot replay an old move against a later hold.
   *
   * A move inside an Unsuspend phase whose ribbon has not played yet is left to that ribbon.
   * Releasing it on arrival stood a ＜Reboot＞ holder up before the board ever showed the
   * end-of-turn suspend that put it down (feedback #3).
   */
  useLayoutEffect(() => {
    const unreleasedPhase = unreleasedUnsuspendPhaseRef.current;
    const unreleasedStart = unreleasedPhase ? eventTimeline.indexOf(unreleasedPhase) : -1;
    const unreleasedEnd =
      unreleasedStart < 0
        ? -1
        : eventTimeline.findIndex((event, index) => index > unreleasedStart && event.kind === "phaseChanged");
    const awaitsRibbon = (index: number) =>
      unreleasedStart >= 0 && index > unreleasedStart && (unreleasedEnd < 0 || index < unreleasedEnd);
    const arrived: string[] = [];
    let highestSeq = appliedUnsuspendSeqRef.current;
    for (const [index, event] of eventTimeline.entries()) {
      if (event.kind !== "cardsMoved" || event.from !== "suspended" || event.to !== "unsuspended") continue;
      if (appliedUnsuspendsRef.current.has(event)) continue;
      if (awaitsRibbon(index)) continue;
      const seq = "seq" in event && typeof event.seq === "number" ? event.seq : undefined;
      if (seq !== undefined && seq <= appliedUnsuspendSeqRef.current) continue;
      if (seq !== undefined && seq > highestSeq) highestSeq = seq;
      appliedUnsuspendsRef.current.add(event);
      arrived.push(...event.instanceIds);
    }
    appliedUnsuspendSeqRef.current = highestSeq;
    if (arrived.length === 0) return;
    const unsuspended = new Set(arrived);
    setHeldSuspendedIds((held) => {
      if (!Array.from(unsuspended).some((permanentId) => held.has(permanentId))) return held;
      return new Set(Array.from(held).filter((permanentId) => !unsuspended.has(permanentId)));
    });
    setHeldPhaseState((held) =>
      held
        ? ({ ...held, players: held.players.map((player) => releaseUnsuspended(player, unsuspended)) } as GameState)
        : held,
    );
    setHeldBreedingState((held) => (held ? { ...held, player: releaseUnsuspended(held.player, unsuspended) } : held));
  }, [eventTimeline]);
  const phaseBatchesRef = useRef(batches);
  phaseBatchesRef.current = batches;

  /**
   * The board the turn handoff starts from. `previous` is the live state of the previous
   * render, which predates every batch of a burst: when the ending turn's last effect and the
   * next turn's unsuspend arrive together, it still shows the board before that effect, so
   * an end-of-turn suspend undone by ＜Reboot＞ never rotated (Discord 1557481090870939840).
   * The newest snapshot taken before the phase opened is the board the turn really ended on.
   */
  function boardBeforePhase(openedPhase: ServerEvent, previous: GameState | undefined): GameState | undefined {
    const openedAt =
      "stateVersion" in openedPhase && typeof openedPhase.stateVersion === "number"
        ? openedPhase.stateVersion
        : undefined;
    if (openedAt === undefined) return previous;
    const snapshot = phaseStateRef.current.snapshots?.filter((candidate) => candidate.stateVersion <= openedAt).at(-1);
    if (snapshot === undefined) return previous;
    if (previous !== undefined && (previous.stateVersion ?? 0) >= snapshot.stateVersion) return previous;
    return snapshot.state;
  }

  async function waitForPhasePrerequisites(
    context: AnimationStepContext,
    awaitedEvents: readonly ServerEvent[],
    phaseOrder: number,
  ) {
    // Batch presentation registers its cues in the following layout effect.
    await Promise.resolve();
    const batchDeadline = Date.now() + PRESENTED_BOARD_BUDGET_MS;
    while (!context.cancelled && !context.skipping && context.mode === "live") {
      // A batch that has slid out of the tracked window is never coming back, so waiting
      // for it is waiting for nothing.
      const oldestTrackedSeq = phaseBatchesRef.current[0]?.events[0]?.seq;
      const evictedFromWindow = (event: ServerEvent) =>
        oldestTrackedSeq !== undefined &&
        "seq" in event &&
        typeof event.seq === "number" &&
        event.seq < oldestTrackedSeq;
      const awaitingBatch =
        Date.now() < batchDeadline &&
        awaitedEvents.some(
          (event) =>
            !evictedFromWindow(event) &&
            !phaseBatchesRef.current.some((batch) =>
              batch.events.some(
                (candidate) =>
                  candidate === event ||
                  ("seq" in event &&
                    "batch" in event &&
                    candidate.seq === event.seq &&
                    candidate.batch === event.batch) ||
                  (!("seq" in event) &&
                    (event.kind === "cardPlayed" ||
                      event.kind === "digivolved" ||
                      event.kind === "hatched" ||
                      event.kind === "movedFromBreeding" ||
                      event.kind === "cardsMoved") &&
                    candidate.kind === event.kind &&
                    (event.kind === "cardsMoved" && candidate.kind === "cardsMoved"
                      ? candidate.instanceIds.join(",") === event.instanceIds.join(",")
                      : candidate.kind !== "cardsMoved" &&
                        event.kind !== "cardsMoved" &&
                        candidate.permanentId === event.permanentId)),
              ),
            ),
        );
      const awaitingCue = queue.hasPendingStep(
        (step) =>
          step.track !== "phaseBanner" &&
          // Audio callbacks have no painted handoff to finish before a ribbon.
          step.track !== "sound" &&
          step.track !== CueTrack.SecurityDock &&
          !OPTION_DOCK_TRACKS.includes(step.track ?? "") &&
          (stepPhaseOrdersRef.current.get(step) ?? 0) < phaseOrder,
      );
      // A clause the ribbon is about to cover gets one readable beat first. The same budget
      // bounds it: a batch that keeps arriving must never hold the ribbon for good.
      const awaitingRead =
        Date.now() < batchDeadline &&
        narrationBefore(phaseOrder).some((item) => Date.now() - item.createdAt < TIMINGS.phaseBannerNoticeRead);
      if (!awaitingBatch && !awaitingCue && !awaitingRead) return;
      await context.wait(16);
    }
  }

  const phaseHistory = useMemo(
    () =>
      (phaseEvents ?? batches.flatMap((batch) => batch.events)).filter(
        (event) => event.kind === "phaseChanged" || event.kind === "turnEnded",
      ),
    [phaseEvents, batches],
  );
  // Establish the old hand/rotation before paint when a patch and its phases arrive together.
  useLayoutEffect(() => {
    for (const [event, order] of phaseOrdersRef.current) {
      if (order <= completedPhaseOrderRef.current && !phaseHistory.includes(event as (typeof phaseHistory)[number])) {
        phaseOrdersRef.current.delete(event);
      }
    }
    const last = lastPhaseEventRef.current;
    lastPhaseEventRef.current = phaseHistory.at(-1);
    if (!phaseBaselineRef.current) {
      phaseBaselineRef.current = true;
      return;
    }
    const fresh = phaseHistory.slice(last ? phaseHistory.lastIndexOf(last) + 1 : 0);
    for (const openedPhase of fresh) {
      if (openedPhase.kind === "phaseChanged" && !isAnnouncedPhase(openedPhase.phase)) continue;
      const phaseOrder = ++nextPhaseOrderRef.current;
      phaseOrdersRef.current.set(openedPhase, phaseOrder);
      const preceding = eventTimeline.slice(
        last ? eventTimeline.lastIndexOf(last) + 1 : 0,
        eventTimeline.indexOf(openedPhase),
      );
      const isArrival = (event: ServerEvent) =>
        event.kind === "cardPlayed" ||
        event.kind === "digivolved" ||
        event.kind === "hatched" ||
        event.kind === "movedFromBreeding" ||
        event.kind === "cardsMoved";
      const arrivals = preceding.filter(isArrival);
      // The previous turn's last effects (an end-of-turn trigger, a DP change) move no card,
      // and their batches can close after this phase's raw event has arrived. Their cues are
      // only queued on that close, so the ribbon waits for every streamed event before it.
      const awaitedEvents = preceding.filter(
        (event) => isArrival(event) || ("seq" in event && "batch" in event && typeof event.batch === "string"),
      );
      if (openedPhase.kind === "turnEnded") {
        const transition: TurnTransitionCue = {
          endingSeat: openedPhase.endingSeat,
          nextSeat: openedPhase.nextSeat,
          turnCount: openedPhase.turnCount,
        };
        setPendingPhaseBanners((count) => count + 1);
        queue.enqueue({
          id: `turn-banner-${transition.turnCount}`,
          side: openedPhase.nextSeat === viewerSeat ? Side.Viewer : Side.Opponent,
          track: "phaseBanner",
          async run(context) {
            try {
              await waitForPhasePrerequisites(context, awaitedEvents, phaseOrder);
              if (context.cancelled || context.mode !== "live") return;
              visiblePhaseBannerRef.current = true;
              // The count belongs to the turn that just ended; the new one arrives with the
              // phase ribbons that follow, which carry it.
              setAnnouncedTurn((current) => ({
                seat: openedPhase.nextSeat,
                count: current?.count ?? openedPhase.turnCount,
              }));
              playCue(openedPhase.endingSeat === viewerSeat ? "endTurn" : "turnChange");
              setTurnTransition(transition);
              await context.wait(TIMINGS.turnBanner);
              await waitForPaintedAnimation(
                () =>
                  typeof document === "undefined"
                    ? null
                    : document.querySelector(`[data-turn-key="${transition.endingSeat}:${transition.turnCount}"]`),
                "battle-banner",
                TIMINGS.turnBanner,
                context,
              );
              setTurnTransition((current) => (current === transition ? null : current));
              await context.wait(TIMINGS.phaseBannerGap);
            } finally {
              visiblePhaseBannerRef.current = false;
              completedPhaseOrderRef.current = phaseOrder;
              setTurnTransition((current) => (current === transition ? null : current));
              setPendingPhaseBanners((count) => count - 1);
            }
          },
        });
        continue;
      }
      if (openedPhase.kind !== "phaseChanged") continue;
      phaseBannerKeyRef.current += 1;
      const banner = phaseBannerFrom({
        phase: openedPhase.phase,
        turnSeat: openedPhase.turnSeat,
        viewerSeat,
        key: phaseBannerKeyRef.current,
      });
      if (banner) {
        setPendingPhaseBanners((count) => count + 1);
        if (banner.phase === UNSUSPEND_PHASE) {
          drawPhaseWaitingRef.current = { seat: openedPhase.turnSeat, phaseOrder };
          unreleasedUnsuspendPhaseRef.current = openedPhase;
          const drawState = boardBeforePhase(openedPhase, previousDrawStateRef.current);
          // The held revision can predate an unsuspend the ending turn made before its End
          // phase (EX13-006): the move reached an earlier pass, and the state patch lags the
          // events. Release every move the held revision does not show yet, not only this
          // pass's arrivals, or the permanent stays rotated until the hold lifts.
          const unsuspendedBeforeActive = new Set(
            eventTimeline
              .slice(0, eventTimeline.indexOf(openedPhase))
              .flatMap((event) =>
                event.kind === "cardsMoved" &&
                event.from === "suspended" &&
                event.to === "unsuspended" &&
                (arrivals.includes(event) ||
                  (drawState !== undefined &&
                    "stateVersion" in event &&
                    typeof event.stateVersion === "number" &&
                    event.stateVersion >= drawState.stateVersion))
                  ? event.instanceIds
                  : [],
              ),
          );
          const heldState = drawState
            ? releaseHandMoves({
                held: {
                  ...drawState,
                  players: drawState.players.map((player) => releaseUnsuspended(player, unsuspendedBeforeActive)),
                } as GameState,
                live: state,
                moves: arrivals,
              })
            : undefined;
          setHeldDrawState(heldState && { seat: openedPhase.turnSeat, state: heldState });
          setHeldPhaseState(heldState);
          const player = heldState?.players[openedPhase.turnSeat];
          if (player) setHeldBreedingState({ seat: openedPhase.turnSeat, player });
          setHeldSuspendedIds(
            new Set(
              drawState?.players[openedPhase.turnSeat]?.battleArea
                .filter((permanent) => permanent.isSuspended)
                .map((permanent) => permanent.permanentId) ?? [],
            ),
          );
        }
        const releaseUnsuspendPhase = () => {
          if (unreleasedUnsuspendPhaseRef.current === openedPhase) unreleasedUnsuspendPhaseRef.current = undefined;
        };
        const releaseDrawHold = () => {
          const owner = drawPhaseWaitingRef.current;
          if (owner?.seat !== openedPhase.turnSeat || phaseOrder < owner.phaseOrder) return;
          drawPhaseWaitingRef.current = null;
          setHeldDrawState(undefined);
        };
        queue.enqueue({
          id: `phase-banner-${banner.key}`,
          side: banner.side,
          track: "phaseBanner",
          async run(context) {
            try {
              if (context.mode !== "live") {
                setHeldSuspendedIds(new Set());
                setHeldPhaseState(undefined);
                setHeldBreedingState(undefined);
                releaseDrawHold();
                return;
              }
              await waitForPhasePrerequisites(context, awaitedEvents, phaseOrder);
              if (context.cancelled || context.mode !== "live") return;
              visiblePhaseBannerRef.current = true;
              if (isAnnouncedPhase(openedPhase.phase)) setAnnouncedPhase(openedPhase.phase);
              setAnnouncedTurn({ seat: openedPhase.turnSeat, count: openedPhase.turnCount });
              const phaseBatch = phaseBatchesRef.current.find((batch) =>
                batch.events.some((event) => event === openedPhase),
              );
              setPhaseBanner({ ...banner, ...(phaseBatch ? { stateVersion: phaseBatch.stateVersion } : {}) });
              if (banner.phase === UNSUSPEND_PHASE) {
                setHeldSuspendedIds(new Set());
                const timeline = phaseStateRef.current.events;
                const activeIndex = timeline.indexOf(openedPhase);
                const afterActive = timeline.slice(activeIndex + 1);
                const nextPhaseIndex = afterActive.findIndex((event) => event.kind === "phaseChanged");
                const unsuspendedIds = new Set(
                  afterActive
                    .slice(0, nextPhaseIndex < 0 ? undefined : nextPhaseIndex)
                    .flatMap((event) =>
                      event.kind === "cardsMoved" && event.from === "suspended" && event.to === "unsuspended"
                        ? event.instanceIds
                        : [],
                    ),
                );
                // Both boards release here, not just the turn player's: ＜Reboot＞
                // unsuspends the opposing Digimon in this same phase (§16-11), and the
                // server reports it among this phase's moves. Releasing only the turn
                // seat left a Reboot holder rotated until the hold lifted a phase later.
                setHeldPhaseState((held) =>
                  held
                    ? ({
                        ...held,
                        players: held.players.map((player) => releaseUnsuspended(player, unsuspendedIds)),
                      } as GameState)
                    : held,
                );
                setHeldBreedingState((held) =>
                  held ? { ...held, player: releaseUnsuspended(held.player, unsuspendedIds) } : held,
                );
                releaseUnsuspendPhase();
                const sweep: UnsuspendSweep = { seat: openedPhase.turnSeat, key: ++unsuspendSweepKeyRef.current };
                queue.enqueue({
                  id: `unsuspend-sweep-${sweep.key}`,
                  track: "unsuspendSweep",
                  replace: true,
                  async run(sweepContext) {
                    if (sweepContext.mode !== "live") return;
                    try {
                      setUnsuspendSweep(sweep);
                      await sweepContext.wait(UNSUSPEND_SWEEP_MS);
                    } finally {
                      setUnsuspendSweep((current) => (current?.key === sweep.key ? null : current));
                    }
                  },
                });
              }
              // The first turn can skip drawing; breeding also releases the hold.
              if (banner.phase === "Draw" || banner.phase === "Breeding" || banner.phase === "Main") {
                releaseDrawHold();
              }
              await context.wait(TIMINGS.phaseBanner);
              await waitForPaintedAnimation(
                () =>
                  typeof document === "undefined" ? null : document.querySelector(`[data-phase-key="${banner.key}"]`),
                "arena-phase-ribbon",
                TIMINGS.phaseBanner,
                context,
              );
              if (banner.phase === "Breeding") {
                // A fast bot may already have evolved in Main. Present the raising
                // area at the Main boundary first, so its hatch remains visible.
                const main = phaseStateRef.current.events.find(
                  (event) =>
                    event.kind === "phaseChanged" &&
                    event.phase === "Main" &&
                    event.turnSeat === openedPhase.turnSeat &&
                    event.turnCount === openedPhase.turnCount,
                );
                // Event revisions precede the patch. The closed batch names the
                // resulting revision, including a hatch coalesced with Main's patch.
                const mainBatch =
                  main &&
                  phaseBatchesRef.current.find((batch) =>
                    batch.events.some(
                      (event) =>
                        event.kind === "phaseChanged" &&
                        event.phase === "Main" &&
                        event.turnSeat === openedPhase.turnSeat &&
                        event.turnCount === openedPhase.turnCount,
                    ),
                  );
                const version =
                  mainBatch?.stateVersion ?? (main && "stateVersion" in main ? main.stateVersion : undefined);
                // Batches that arrive coalesced leave no revision between Breeding and Main;
                // the newest older one can predate this Breeding phase, even the board before
                // the match was laid out, and holding that emptied the raising area and egg
                // deck until Main's ribbon ended. No revision in range means no hold.
                const breedingOpenedAt =
                  "stateVersion" in openedPhase && typeof openedPhase.stateVersion === "number"
                    ? openedPhase.stateVersion
                    : undefined;
                const snapshot =
                  version === undefined
                    ? undefined
                    : phaseStateRef.current.snapshots
                        ?.filter(
                          (candidate) =>
                            candidate.stateVersion <= version &&
                            (breedingOpenedAt === undefined || candidate.stateVersion >= breedingOpenedAt),
                        )
                        .at(-1);
                const player = snapshot?.state.players[openedPhase.turnSeat];
                setHeldBreedingState(player ? { seat: openedPhase.turnSeat, player } : undefined);
              } else if (banner.phase === "Main") {
                setHeldBreedingState(undefined);
                setHeldPhaseState(undefined);
              }
              setPhaseBanner((current) => (current?.key === banner.key ? null : current));
              await context.wait(TIMINGS.phaseBannerGap);
            } finally {
              visiblePhaseBannerRef.current = false;
              completedPhaseOrderRef.current = phaseOrder;
              setPhaseBanner((current) => (current?.key === banner.key ? null : current));
              setPendingPhaseBanners((count) => count - 1);
              releaseUnsuspendPhase();
              if (context.cancelled || context.mode !== "live") {
                setHeldSuspendedIds(new Set());
                setHeldPhaseState(undefined);
                setHeldBreedingState(undefined);
                releaseDrawHold();
              }
            }
          },
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseHistory]);

  useLayoutEffect(() => {
    if (unreleasedUnsuspendPhaseRef.current || !state) {
      return;
    }
    const version = presentedStateVersion ?? state.stateVersion;
    setHeldDrawState((held) => {
      if (!held) {
        return held;
      }
      const snapshot = phaseStateRef.current.snapshots
        ?.filter(
          (candidate) =>
            candidate.stateVersion > held.state.stateVersion &&
            candidate.stateVersion <= version &&
            candidate.state.phase === Phase.Active &&
            candidate.state.turnSeat === held.seat,
        )
        .at(-1);
      if (!snapshot) {
        return held;
      }
      return { seat: held.seat, state: snapshot.state };
    });
  });
}
