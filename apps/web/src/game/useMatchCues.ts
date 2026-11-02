import { useManualSignalNarration } from "@/game/manual/useManualSignalNarration";
import { Phase } from "@aegis/shared/schema/enums";
import { CardMovePosition } from "@aegis/shared/protocol/CardMovePosition";
import { createDiscardedSourceResolution } from "./match/present/announcements";
import { createDiscardedSourcePanels } from "./match/narration/presentableNarration";
/* Everything the board plays back at the player because the server said
   something happened: sounds, info panels, the attack call-out and target arrow, the
   security clash, the recovery and effect notices, the turn banner and the draw
   flights.

   The hook diffs the event log and turns each new event into steps on the
   animation queue. One cue owns one track, so a fresh cue of the same kind
   replaces its predecessor exactly as the old `clearTimeout` did, while cues of
   different kinds keep running side by side.

   Reconnect replay is the reason `cueBaselineRef` exists: the first pass over
   the log is a baseline, so a replayed history plays no sound, opens no panel,
   and enqueues its steps in `replay` mode — they set their state and clear it in
   the same beat, leaving the board in the right final state with nothing
   animating. `prefers-reduced-motion` and a hidden tab put the queue in `drain`
   mode instead, which collapses the decorative cues and leaves the ones that
   carry something to read their full time.

   The client owns no rules here: every cue is a reaction to a server event
   (ARCHITECTURE.md §4). */

import { CueTrack, OpeningDealState } from "./match/enums";
import { holdsTheBoard, OPTION_DOCK_TRACKS } from "./match/tracks";
import { liveMode } from "./match/environment";
import { buildCardSiteIndex } from "./match/cardSiteIndex";
import { presentServerBatch } from "./match/present/presentBatch";
import type { MemoryHold } from "./match/present/memoryHold";
import type { OptionDockHold } from "./match/present/optionDock";
import { securityGrowthSeatOf } from "./match/present/securityGrowth";
import { securityHold } from "./match/securityHold";
import { traceCueStep } from "./cueTrace";
import { cueFlights } from "./match/flights";
import { useDecisionBarrier } from "./match/queue/useDecisionBarrier";
import { useResultHold } from "./match/queue/useResultHold";
import { usePhaseBanners } from "./match/queue/usePhaseBanners";
import { useDpPulses } from "./match/watchers/useDpPulses";
import { useDrawWatcher } from "./match/watchers/useDrawWatcher";
import { useRestrictionPulses } from "./match/watchers/useRestrictionPulses";
import { useSecurityCountWatcher } from "./match/watchers/useSecurityCountWatcher";
import { narrationStream } from "./match/narration/narrationStream";
import { createEffectSequence } from "./match/effectSequence";
import type {
  DeleteBurst,
  DrawBurst,
  DrawFlight,
  DrawFlightCard,
  DrawPhaseOwner,
  MatchCueAnchors,
  MatchCues,
  RevealOnStage,
  SecurityBreakCue,
  SecurityClause,
  TurnTransitionCue,
  UnsuspendSweep,
} from "./match/types";

export type {
  DeleteBurst,
  DrawBurst,
  DrawFlight,
  MatchCueAnchors,
  MatchCues,
  SecurityBreakCue,
  TurnTransitionCue,
  UnsuspendSweep,
} from "./match/types";
export { CueTrack, AttackDirection, SecurityBreakPhase } from "./match/enums";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createStackTopResolutions } from "./match/stackTopResolutions";
import { snapshotGameState, type StateSnapshot } from "../net/presentedState";
import {
  type GameState,
  type Seat,
  type SequencedServerEvent,
  type ServerEvent,
  type PresentationReport,
  type DecisionRequest,
} from "@aegis/shared";
import { playSound, type SoundKind } from "../design/sound";
import { otherSeat } from "./boardModel";
import { buildInstanceIndex } from "./decisionModel";
import { batchesAfter, type ServerBatch } from "../net/serverBatches";
import { shouldPlayCue, type CueTimestamps } from "./soundEvents";
import {
  buildInstanceSeatIndex,
  buildInstanceArtIndex,
  type AttackAnnouncement,
  type SidePanel,
  type SidePanelLookup,
} from "./sidePanels";
import { noticeRemaining, rejectionNotice, type MatchNotice } from "./notices";
import {
  narrationReadingTime,
  pauseNarration,
  resumeNarration,
  trimNarration,
  NARRATION_QUEUE_LIMIT,
  type NarrationItem,
} from "./narration";
import { type SecurityBranchScene, type SecurityClashAttacker, type SecurityClashScene } from "./securityClash";
import { type PermanentBurst, type ZoneShowcase } from "./showcases";
import type { RevealShowcase } from "./match/present/revealShowcases";
import {
  createAnimationQueue,
  type AnimationQueue,
  type AnimationStep,
  type AnimationStepContext,
} from "./animationQueue";
import { createPresentationProgress } from "./presentationProgress";
import type { PresentationPacing, PresentationProbe } from "./presentationProbe";
import { CONSEQUENCE_GATE_MAX_MS, observeGateExpiry, waitForGate } from "./match/presentationGate";
import type { CostClause, DeletionReadyAt, PendingAnnounceGate, PresentationGate } from "./match/presentationGate";
import type { RemovalLink } from "./match/removalChain";
import { presentationTelemetry } from "./presentationTelemetry";
import { type EffectActivation, type EffectSourceLookup } from "./effectSource";
import { type FieldClashScene, type OpenAttack } from "./fieldClash";
import { type PhaseBanner } from "./phaseBanner";
import { type DpPulse } from "./dpPulse";
import { type FreezeFlags, type FreezePulse } from "./freezePulse";
import { motionPreference } from "@/design/motion/motionPreference";

export function useMatchCues({
  batches,
  phaseEvents,
  state,
  snapshots,
  viewerSeat,
  mulliganOpen,
  decisionPending = false,
  collapseNarration = false,
  narrationLimit = NARRATION_QUEUE_LIMIT,
  decisionStateVersion,
  decisionSourceCardId,
  targetDecision,
  anchors,
  onActionRejected,
  onPresentationReport,
  devProbe,
  presentationPacing = "current",
  holdEffectsForConfirmation = false,
}: {
  /** The closed server batches, in order. One batch is one moment of the rules. */
  batches: readonly ServerBatch[];
  /** Raw phase events arrive before the state patch and its batch-close marker. */
  phaseEvents?: readonly ServerEvent[];
  state: GameState | undefined;
  snapshots?: readonly StateSnapshot[];
  viewerSeat: Seat;
  /** The opening hand and a mulligan redeal are dealt, not drawn. */
  mulliganOpen: boolean;
  /**
   * The server is waiting on an answer from the viewer. A check the server stopped
   * mid-resolution to ask something can only be closed once that answer is given, so the
   * question is what releases a presentation still holding the screen (see below).
   */
  decisionPending?: boolean;
  /** The portrait phone folds both narration columns into one centred slot. */
  collapseNarration?: boolean;
  /**
   * How many recent moments a column retains. Its visual height is capped separately so
   * the reader can scroll through more than the two notices that fit at a glance.
   */
  narrationLimit?: number;
  /**
   * The revision the viewer's open decision was raised at (`DecisionRequest.stateVersion`).
   * The barrier fast-forwards the queue up to it before the prompt is shown, so the board
   * the viewer answers over is the board the question was asked about.
   */
  decisionStateVersion?: number;
  /** The card whose effect the viewer's open decision is about, when it names one. */
  decisionSourceCardId?: string;
  /** A new clause waits for this viewer-owned field-target selection to be confirmed. */
  targetDecision?: DecisionRequest | undefined;
  anchors: MatchCueAnchors;
  onActionRejected: (reason: string) => void;
  onPresentationReport?: (report: PresentationReport) => void;
  /** Dev inspector hooks (the effects lab). Absent in every real match. */
  devProbe?: PresentationProbe;
  /**
   * How simultaneous effects are paced. `sequential` plays each triggered effect as its own
   * announce, results and settle beats, one after the other (match/effectSequence.ts).
   */
  presentationPacing?: PresentationPacing;
  holdEffectsForConfirmation?: boolean;
}): MatchCues {
  // How far the presentation has got, in server revisions. Every step is counted into the
  // batch it was enqueued for, so the board can be rendered from the snapshot of the batch
  // the queue is actually presenting instead of from whatever the server has since resolved.
  const [presentedStateVersion, setPresentedStateVersion] = useState<number | undefined>(undefined);
  const publishPresentedRef = useRef<() => void>(() => {});
  const progress = useMemo(
    () => createPresentationProgress(() => publishPresentedRef.current(), presentationTelemetry),
    [],
  );
  const [decisionAnimationsPending, setDecisionAnimationsPending] = useState(false);
  const [playbackPending, setPlaybackPending] = useState(false);
  // The newest batch handed to the queue. Set in the same layout pass that enqueues the batch's
  // steps, so a render never pairs this revision with a queue that has not seen its steps yet.
  const [consumedStateVersion, setConsumedStateVersion] = useState<number | undefined>(undefined);
  // Every queue change bumps this. Nothing reads what it counts — it is the proof that the
  // queue is still moving, which is what the decision stall watchdog waits on.
  const [queueActivity, setQueueActivity] = useState(0);
  // The watchdog fired: the queue stopped moving while the viewer had a question to answer,
  // so the prompt is handed over whatever the queue still claims to owe.
  const [decisionStalled, setDecisionStalled] = useState(false);
  const [effectAwaitingConfirmation, setEffectAwaitingConfirmation] = useState(false);
  const effectConfirmationRef = useRef<(() => void) | null>(null);
  const holdEffectsRef = useRef(holdEffectsForConfirmation);
  holdEffectsRef.current = holdEffectsForConfirmation;
  const viewerReadingRef = useRef(false);
  const readingHeldRef = useRef(false);
  useEffect(() => {
    if (!holdEffectsForConfirmation) effectConfirmationRef.current?.();
  }, [holdEffectsForConfirmation]);
  useEffect(() => () => effectConfirmationRef.current?.(), []);
  const queueChangedRef = useRef<() => void>(() => {});
  const visiblePhaseBannerRef = useRef(false);
  // A cue belongs after its preceding phase announcement, not merely after whichever
  // ribbon happens to be visible when its batch arrives. Phase prerequisites exclude
  // future cues so a later attack cannot hold back the very phase it is waiting for.
  const completedPhaseOrderRef = useRef(0);
  const nextPhaseOrderRef = useRef(0);
  const phaseOrdersRef = useRef(new Map<ServerEvent, number>());
  const enqueuePhaseOrderRef = useRef<number | undefined>(undefined);
  const stepPhaseOrdersRef = useRef(new WeakMap<AnimationStep, number>());
  const narrationPhaseOrdersRef = useRef(new Map<string, number>());
  const eventTimeline = phaseEvents ?? batches.flatMap((batch) => batch.events);
  const phaseStateRef = useRef({ events: eventTimeline, snapshots });
  phaseStateRef.current = { events: eventTimeline, snapshots };
  function phaseOrderFor(events: readonly ServerEvent[]): number {
    const first = events[0];
    let order = completedPhaseOrderRef.current;
    // Fabricated previews may provide raw, unsequenced phase events separately
    // from cloned batch events. Use batch order there, matching phase identities.
    const timeline = phaseEvents?.some((event) => !("seq" in event))
      ? batches.flatMap((batch) => batch.events)
      : eventTimeline;
    for (const event of timeline) {
      const phaseOrder =
        phaseOrdersRef.current.get(event) ??
        [...phaseOrdersRef.current].find(([phase]) =>
          phase.kind === "phaseChanged" && event.kind === "phaseChanged"
            ? phase.phase === event.phase && phase.turnSeat === event.turnSeat && phase.turnCount === event.turnCount
            : phase.kind === "turnEnded" &&
              event.kind === "turnEnded" &&
              phase.turnCount === event.turnCount &&
              phase.endingSeat === event.endingSeat,
        )?.[1];
      order = phaseOrder ?? order;
      if (
        event === first ||
        (first &&
          "seq" in first &&
          "batch" in first &&
          "seq" in event &&
          "batch" in event &&
          first.seq === event.seq &&
          first.batch === event.batch)
      )
        return order;
    }
    return completedPhaseOrderRef.current;
  }
  const presentationReporterRef = useRef(onPresentationReport);
  presentationReporterRef.current = onPresentationReport;
  const devProbeRef = useRef(devProbe);
  devProbeRef.current = devProbe;
  const presentationPacingRef = useRef(presentationPacing);
  presentationPacingRef.current = presentationPacing;
  const presentationBatchRef = useRef<{ batchId: string; stateVersion: number } | undefined>(undefined);
  const batchVersionsRef = useRef(new Map<string, number>());
  /** The revision of the last presented batch that carried events: the board a viewer last saw change. */
  const eventfulBoardVersionRef = useRef<number | undefined>(undefined);
  const heldOriginsRef = useRef(new WeakMap<object, { batchId: string; stateVersion: number; phaseOrder: number }>());
  const stepBatchesRef = useRef(new WeakMap<AnimationStep, { batchId: string; stateVersion: number }>());
  const viewerSeatRef = useRef(viewerSeat);
  viewerSeatRef.current = viewerSeat;
  const effectSequence = useMemo(() => createEffectSequence({ viewerSeat: () => viewerSeatRef.current }), []);
  const batchOf = (step: AnimationStep) => step.origin?.batchId ?? stepBatchesRef.current.get(step)?.batchId;
  const queue = useMemo(() => {
    const inner = createAnimationQueue({
      mode: liveMode(),
      onChange: () => queueChangedRef.current(),
      onError: (error, step) => console.error("[MATCH_CUE] step failed", { step: step.id, error }),
      onStep: ({ step, ...event }) => {
        const probe = devProbeRef.current;
        if (probe?.onStep) {
          try {
            const batch = step.origin ?? stepBatchesRef.current.get(step);
            probe.onStep({
              ...event,
              step,
              ...(batch ? { batch: { batchId: batch.batchId, stateVersion: batch.stateVersion } } : {}),
              at: performance.now(),
            });
          } catch {
            // Diagnostic transport must never interrupt the presentation.
          }
        }
        if (event.mode === "replay") return;
        traceCueStep(event.phase, step.id, step.track ?? "main", event.cancelled);
        try {
          presentationReporterRef.current?.({
            ...event,
            ...(step.origin ?? stepBatchesRef.current.get(step)),
            ...(step.side ? { side: step.side } : {}),
            stepId: step.id,
            track: step.track ?? "main",
            clientTimestamp: Date.now(),
            pendingCount: inner.pendingCount(),
          });
        } catch {
          // Diagnostic transport must never interrupt the presentation.
        }
      },
    });
    const counted = (step: AnimationStep): AnimationStep => {
      const phaseOrder = step.origin?.phaseOrder ?? enqueuePhaseOrderRef.current ?? completedPhaseOrderRef.current;
      const gated =
        step.track === "phaseBanner" ||
        step.track === "unsuspendSweep" ||
        step.track === CueTrack.DrawPresentation ||
        step.track?.startsWith("turnDrawFlight-")
          ? step
          : {
              ...step,
              async run(context: AnimationStepContext) {
                // Later server batches may arrive while a ribbon is still on screen.
                // Keep their visual cues behind that ribbon, preserving its full duration.
                while (
                  (visiblePhaseBannerRef.current || completedPhaseOrderRef.current < phaseOrder) &&
                  !context.cancelled &&
                  !context.skipping &&
                  context.mode === "live"
                ) {
                  await context.wait(16);
                }
                await step.run(context);
              },
            };
      // A replayed or drained step presents no moment of its own: reconnect history and a
      // screen with no animation to watch both render the live board (presentedState.ts).
      const countedStep =
        inner.getMode() !== "live" || step.mode === "replay" || !holdsTheBoard(step) ? gated : progress.track(gated);
      stepPhaseOrdersRef.current.set(countedStep, phaseOrder);
      if (presentationBatchRef.current) stepBatchesRef.current.set(countedStep, presentationBatchRef.current);
      return countedStep;
    };
    return {
      ...inner,
      // The mode sync below leaves a paused queue alone, so resuming catches up with it.
      resume() {
        inner.resume();
        inner.setMode(liveMode());
      },
      enqueue(step: AnimationStep | readonly AnimationStep[]) {
        inner.enqueue(Array.isArray(step) ? step.map(counted) : counted(step as AnimationStep));
        // An idle queue is the proof that nothing is left to present, whatever became of
        // the steps — a track replaced before a step ever started runs no `finally`.
        void inner.idle().then(() => progress.settle());
      },
    };
  }, [progress]);
  // A gate that ran out its ceiling is a cue nobody handed over: the viewer sat through
  // the whole ceiling with the board held at an older revision. It is reported on the
  // diagnostic channel so the stall shows up in the match log on its own, rather than
  // waiting for a player to describe a frozen screen.
  useEffect(
    () =>
      observeGateExpiry(({ label, ceilingMs }) => {
        console.error("[MATCH_CUE] gate expired", { label, ceilingMs });
        try {
          presentationReporterRef.current?.({
            phase: "expired",
            stepId: label,
            track: "gate",
            clientTimestamp: Date.now(),
            durationMs: ceilingMs,
            mode: queue.getMode(),
            cancelled: false,
            skipping: false,
            failed: true,
            pendingCount: queue.pendingCount(),
          });
        } catch {
          // Diagnostic transport must never interrupt the presentation.
        }
      }),
    [queue],
  );
  // Every finite cue is a prerequisite for a new choice. The security dock and the
  // battle hold are deliberately excluded: both wait for the answer itself and would
  // deadlock. Toast reading happens outside the queue, so it never delays a decision.
  queueChangedRef.current = () => {
    setDecisionAnimationsPending(
      queue.hasPendingStep(
        (step) =>
          step.track !== CueTrack.SecurityDock && step.track !== CueTrack.SecurityHold && step.blocksDecision !== false,
      ),
    );
    // The open-ended docks and holds wait for an answer a finished match never sends.
    setPlaybackPending(
      queue.hasPendingStep(
        (step) =>
          step.track !== "sound" &&
          step.track !== CueTrack.SecurityDock &&
          step.track !== CueTrack.SecurityHold &&
          !OPTION_DOCK_TRACKS.includes(step.track ?? ""),
      ),
    );
    setQueueActivity((count) => count + 1);
  };
  // Assigned on every render so the queue's bookkeeping always reaches the current setter.
  publishPresentedRef.current = () => setPresentedStateVersion(progress.current());

  const [narration, setNarration] = useState<ReadonlyMap<string, NarrationItem>>(new Map());
  useManualSignalNarration({ state, viewerSeat, collapseNarration, narrationLimit, setNarration });
  const [rejection, setRejection] = useState<MatchNotice | null>(null);
  const narrationRef = useRef(narration);
  narrationRef.current = narration;
  const [attackAnnouncement, setAttackAnnouncement] = useState<AttackAnnouncement | null>(null);
  const [attackAwaitingCause, setAttackAwaitingCause] = useState(false);
  const [turnTransition, setTurnTransition] = useState<TurnTransitionCue | null>(null);
  const [securityClash, setSecurityClash] = useState<SecurityClashScene | null>(null);
  const [securityBreak, setSecurityBreak] = useState<SecurityBreakCue | null>(null);
  // Security cards a scene is still holding: the board has already dropped each one, and
  // the scene that shows it leaving has not reached that beat yet. Keyed by scene so a
  // cancelled scene releases exactly its own card and never a newer scene's.
  //
  // Phase 3 kept this hold. The presented snapshot lags by BATCH, and a check removes the
  // card and reveals it inside one batch, so the snapshot cannot hold the figure through
  // the reveal — only this can.
  const [heldSecurityCards, setHeldSecurityCards] = useState<ReadonlyMap<number, { seat: Seat; count: number }>>(
    new Map(),
  );
  const [securityBranch, setSecurityBranch] = useState<SecurityBranchScene | null>(null);
  const [optionBranch, setOptionBranch] = useState<SecurityBranchScene | null>(null);
  // The check whose reveal the screen still owes the viewer, by clash key.
  const [pendingRevealKey, setPendingRevealKey] = useState<number | null>(null);
  // The revision the viewer's prompt is waiting for the presentation to reach. Null
  // whenever no prompt is waiting (docs/presentation-queue-plan.md 3.2).
  const [decisionBarrier, setDecisionBarrier] = useState<number | null>(null);
  const [unsuspendSweep, setUnsuspendSweep] = useState<UnsuspendSweep | null>(null);
  const [deleteBursts, setDeleteBursts] = useState<readonly DeleteBurst[]>([]);
  const [securityHitSeat, setSecurityHitSeat] = useState<number | null>(null);
  const [drawFlights, setDrawFlights] = useState<readonly DrawFlight[]>([]);
  const [drawBursts, setDrawBursts] = useState<readonly DrawBurst[]>([]);
  const [zoneShowcase, setZoneShowcase] = useState<ZoneShowcase | null>(null);
  const [revealShowcase, setRevealShowcase] = useState<RevealShowcase | null>(null);
  const [permanentBursts, setPermanentBursts] = useState<ReadonlyMap<string, PermanentBurst>>(new Map());
  const [pendingPermanentIds, setPendingPermanentIds] = useState<ReadonlySet<string>>(new Set());
  const [phaseBanner, setPhaseBanner] = useState<PhaseBanner | null>(null);
  const [pendingPhaseBanners, setPendingPhaseBanners] = useState(0);
  const [heldDrawState, setHeldDrawState] = useState<{ seat: Seat; state: GameState } | undefined>();
  const [heldPhaseState, setHeldPhaseState] = useState<GameState | undefined>();
  const [heldMemory, setHeldMemory] = useState<MemoryHold | undefined>();
  const memoryHoldKeyRef = useRef(0);
  /** The turn seat the presented batches have reached, which is what the gauge is signed for. */
  const presentedTurnSeatRef = useRef<Seat>(state?.turnSeat ?? 0);
  const [heldBlowState, setHeldBlowState] = useState<GameState | undefined>();
  const [heldSecurityEffectState, setHeldSecurityEffectState] = useState<GameState | undefined>();
  const [heldBreedingState, setHeldBreedingState] = useState<MatchCues["heldBreedingState"]>();
  const [heldDeletions, setHeldDeletions] = useState<MatchCues["heldDeletions"]>(new Map());
  const [stackStripHolds, setHeldStackStrips] = useState<MatchCues["heldStackStrips"]>(new Map());
  const heldStackStrips = new Map(
    [...stackStripHolds].map(([key, held]) => [
      key,
      {
        ...held,
        returnedInstanceId: batches
          .filter((batch) => batch.stateVersion >= held.stateVersion)
          .flatMap((batch) => batch.events)
          .filter(
            (event) =>
              event.kind === "cardsMoved" &&
              event.to === "hand" &&
              (event.from === CardMovePosition.VARIOUS.value ||
                event.from === "battleArea" ||
                event.from === CardMovePosition.DIGIVOLUTION_CARDS.value),
          )
          .flatMap((event) => (event.kind === "cardsMoved" ? event.instanceIds : []))
          .find((instanceId) =>
            [held.permanent.topCard, ...held.permanent.stack].some((card) => card.instanceId === instanceId),
          ),
      },
    ]),
  );
  const [heldTrashArrivals, setHeldTrashArrivals] = useState<MatchCues["heldTrashArrivals"]>(new Map());
  const [heldHandArrivals, setHeldHandArrivals] = useState<MatchCues["heldHandArrivals"]>(new Map());
  const trashArrivalKeyRef = useRef(0);
  const [announcedPhase, setAnnouncedPhase] = useState(state?.phase);
  const [announcedTurn, setAnnouncedTurn] = useState<{ seat: Seat; count: number } | undefined>(
    state && { seat: state.turnSeat, count: state.turnCount },
  );
  const [heldSuspendedIds, setHeldSuspendedIds] = useState<ReadonlySet<string>>(new Set());
  const previousDrawStateRef = useRef<GameState | undefined>(undefined);
  const phaseBaselineRef = useRef(false);
  const lastPhaseEventRef = useRef<Extract<ServerEvent, { kind: "phaseChanged" | "turnEnded" }> | undefined>(undefined);
  /** The seat whose turn-start draw is held back, or null while nothing is held. */
  const drawPhaseWaitingRef = useRef<DrawPhaseOwner | null>(null);
  const [combatImpactIds, setCombatImpactIds] = useState<ReadonlySet<string>>(new Set());
  const [fieldClash, setFieldClash] = useState<FieldClashScene | null>(null);
  const [dpPulses, setDpPulses] = useState<ReadonlyMap<string, DpPulse>>(new Map());
  const [dpBadgeSuppressions, setDpBadgeSuppressions] = useState<ReadonlyMap<string, number>>(new Map());
  const [freezePulses, setFreezePulses] = useState<ReadonlyMap<string, FreezePulse>>(new Map());
  const [effectSources, setEffectSources] = useState<readonly EffectActivation[]>([]);
  const [deckRiffles, setDeckRiffles] = useState<ReadonlyMap<string, number>>(new Map());
  const [securityFlights, setSecurityFlights] = useState<ReadonlyMap<number, number>>(new Map());
  const [securityDealCounts, setSecurityDealCounts] = useState<ReadonlyMap<Seat, number>>(new Map());

  // Cues are observed twice for your own actions (the intent handler fires one
  // immediately, the server echo arrives later), so repeats are suppressed.
  const cuePlayedAtRef = useRef<CueTimestamps>({});
  const cueBaselineRef = useRef(false);
  /** The last batch already presented, so a re-render presents nothing twice. */
  const lastCueBatchRef = useRef<string | undefined>(undefined);
  // The newest event a presented batch carried. Everything in the raw stream past it belongs
  // to a batch still open or still queued, whose growths are its own to narrate.
  const lastPresentedSeqRef = useRef(0);
  /** Deletions already queued, spanning adjacent server batches. */
  const deletionBurstPresentedRef = useRef(new Set<string>());
  const removalChainRef = useRef<RemovalLink | null>(null);
  const noticeSequenceRef = useRef(0);
  const sidePanelSequenceRef = useRef(0);
  const narrationSequenceRef = useRef(0);
  /**
   * The batch most recently presented. A notice a check held back is raised by a later
   * cue, so the item it becomes is stamped with the batch the screen has reached rather
   * than with a boundary it has already left behind.
   */
  const lastBatchIdRef = useRef("");
  /** The advance each presenting slot is waiting on, so a tap moves it on. */
  const narrationLimitRef = useRef(narrationLimit);
  narrationLimitRef.current = narrationLimit;
  const collapseNarrationRef = useRef(collapseNarration);
  collapseNarrationRef.current = collapseNarration;
  /** Set by an explicit skip: every item still queued is collapsed rather than read. */
  const narrationSkipRef = useRef(false);
  // Read inside a running step, so they follow the live props rather than the ones the
  // step was enqueued under.
  const decisionPendingRef = useRef(decisionPending);
  decisionPendingRef.current = decisionPending;
  const decisionSourceCardIdRef = useRef(decisionSourceCardId);
  decisionSourceCardIdRef.current = decisionSourceCardId;
  const targetDecisionRef = useRef(targetDecision);
  targetDecisionRef.current = targetDecision;
  const targetClausesRef = useRef(new Map<string, () => void>());
  const batchesRef = useRef(batches);
  batchesRef.current = batches;
  const liveStateVersionRef = useRef(state?.stateVersion);
  liveStateVersionRef.current = state?.stateVersion;
  /** The live revision the state watchers last compared against; updated after they run. */
  const watchedLiveVersionRef = useRef(state?.stateVersion);
  // A security card that resolves an effect moves its notice out of the panels'
  // half of the screen; the flag is set by the check and spent by the effect.
  const securityEffectPendingRef = useRef(false);
  // The security cards whose clause the current check has already read out.
  const securityClausesReadRef = useRef(new Set<string>());
  // Notices a check handed to its centre-stage sequence and that the sequence has not
  // read out yet. A newer check replaces that track, so they are flushed rather than
  // dropped with it — a lost animation is a shrug, a lost effect description is not.
  const heldNoticesRef = useRef<readonly MatchNotice[]>([]);
  const readOutHeldRef = useRef(new WeakSet<object>());
  // The side panels those same notices belong with. A revealed-cards panel is the other
  // half of what an effect did, so it waits on exactly the cue the notice waits on —
  // otherwise the panel prints an [On Play] result beside a card still mid-reveal.
  const heldPanelsRef = useRef<readonly SidePanel[]>([]);
  const revealOnStageRef = useRef<RevealOnStage | null>(null);
  // The dock the centre-stage track is currently holding open, if any. The dock step polls
  // it: the check closing (or a newer reveal claiming the key) is what lets the card go.
  const securityDockRef = useRef<{ key: number; closed: boolean } | null>(null);
  // The battle hold the centre of the screen is currently keeping open, if any. Polled the
  // same way the dock is: the check closing is what releases the card into its outcome beat.
  const securityHoldRef = useRef<{ key: number; closed: boolean; handedOver?: boolean } | null>(null);
  // The blow a security battle has yet to land. A field battle makes its losers wait on
  // the remaining declaration-arrow beat plus its impact; a check's scene is open-ended —
  // its hold runs as long as the server takes to answer what the check asked. So the
  // wait is a gate rather than a duration: it opens when the outcome beat has played, and
  // whatever the check deleted shatters then, not seconds ahead of the battle that did it.
  const securityBlowRef = useRef<{ key: number; landed: boolean; gate: PresentationGate } | null>(null);
  // Opens once a docked security card's [Security] clause is on screen. Until then it stands
  // in for the causing effect of everything the check does, so no consequence runs ahead of
  // the card that caused it. A question the check asks, or the turn ending, hands the board
  // back early, the same way they end the battle hold.
  const securityClauseGateRef = useRef<SecurityClause | null>(null);
  // A used Option has the same open-ended lifetime as a docked Security card: it starts
  // at cardPlayed and closes only when the server confirms its post-resolution routing.
  const optionDockRef = useRef<OptionDockHold | null>(null);
  // `cardsMoved` names only instance ids, so the panels need the board's current
  // identity and ownership index to name the cards that just moved.
  const sidePanelLookupRef = useRef<SidePanelLookup>({ cardId: () => undefined, seat: () => undefined });
  // The card the checked player is defending against. A security check carries no
  // attacker, so it is remembered from the attack that opened the check.
  const lastVisibleArtRef = useRef(new Map<string, string>());
  const securityAttackerRef = useRef<SecurityClashAttacker | undefined>(undefined);
  /**
   * What happened to the declared attacker before its check: whether an effect stood it back
   * up (BeelStarmon's [When Attacking] unsuspend) and which cards left the board meanwhile.
   * The held battle board is rebuilt from it when one patch carries the whole attack.
   */
  const attackSinceDeclarationRef = useRef<
    { permanentId: string; suspended: boolean; movedInstanceIds: Set<string> } | undefined
  >(undefined);
  const securityClashKeyRef = useRef(0);
  const queuedSecurityKeyRef = useRef<number | null>(null);
  // The attack still open on the board, so the battle that closes it can be staged
  // even when its declaration and its resolution arrive in the same batch.
  const openAttackRef = useRef<OpenAttack | null>(null);
  const fieldClashKeyRef = useRef(0);
  // A battle's blow, by loser, until the deletion it causes: the server can publish that a batch later.
  const combatLandedRef = useRef(new Map<string, PresentationGate>());
  const drawFlightKeyRef = useRef(0);
  const deleteBurstKeyRef = useRef(0);
  const topResolutions = useMemo(createStackTopResolutions, []);
  const showcaseKeyRef = useRef(0);
  const revealShowcaseKeyRef = useRef(0);
  const dpPulseKeyRef = useRef(0);
  const freezePulseKeyRef = useRef(0);
  const effectSourceKeyRef = useRef(0);
  const optionDockKeyRef = useRef(0);
  const deletionReadyAtRef = useRef(new Map<string, DeletionReadyAt>());
  // The announcement a batch is holding its consequences behind, the one whatever is being
  // queued right now must wait for, and a gate armed before its clause was known.
  const effectAnnounceGateRef = useRef<PresentationGate | null>(null);
  const causingEffectGateRef = useRef<PresentationGate | null>(null);
  const pendingAnnounceGateRef = useRef<PendingAnnounceGate | null>(null);
  const costClauseRef = useRef<CostClause | null>(null);
  const deckRiffleKeyRef = useRef(0);
  // Where every card the viewer can see currently sits, so an activation can be
  // played at its source and a reshuffle at the pile it landed in.
  const cardSiteRef = useRef<{
    locate: EffectSourceLookup;
    seatOf: (instanceId: string) => Seat | undefined;
    topInstanceOf: (permanentId: string) => string | undefined;
  }>({
    locate: () => undefined,
    seatOf: () => undefined,
    topInstanceOf: () => undefined,
  });
  // Last read of every permanent's live DP, so the next commit can tell which
  // figures actually moved. The first read is only a baseline.
  const dpByPermanentRef = useRef<Map<string, number> | null>(null);
  // The same baseline discipline for the projected attack/block restrictions.
  const restrictionsByPermanentRef = useRef<Map<string, FreezeFlags> | null>(null);
  const handCountsRef = useRef<{ you: number; opp: number } | null>(null);
  // Last read of each seat's security count, so a stack an effect grew can be told
  // from one an event already narrated — a recovery or an effect's add owns its own flight and notice.
  const securityCountsRef = useRef<{ you: number; opp: number } | null>(null);
  const securityGrowthClaimedRef = useRef<Map<Seat, number>>(new Map());
  const securityGainKeyRef = useRef(0);
  // The opening stack is dealt once. Security seen before that — a reconnection into a
  // match already under way — retires the deal rather than playing it late.
  const openingSecurityDealRef = useRef(OpeningDealState.Pending);
  // Destruction scenes enqueued and not yet finished. A chained effect (Medusamon's
  // Petrification tokens) trashes one security card per resolution step, so each trash
  // arrives in its own batch — and each batch's first shield break must NOT take the
  // centre of the screen off the previous card's still-playing scene.
  const pendingDestructionsRef = useRef(0);
  // Set when the draw phase is announced and spent by the hand that grows in the
  // same commit, which is what tells a turn-start draw from an effect draw.
  const turnStartDrawRef = useRef({ you: false, opp: false });
  const eventDrawCountsRef = useRef<{ you?: number; opp?: number }>({});
  const pendingDigivolutionDrawRef = useRef(new Map<Seat, PresentationGate>());

  const playCue = (kind: SoundKind) => {
    const now = Date.now();
    if (!shouldPlayCue(kind, now, cuePlayedAtRef.current)) return;
    cuePlayedAtRef.current[kind] = now;
    playSound(kind);
  };

  // Reduced motion and a hidden tab both mean "no animation to watch": collapse
  // the decorative waits and leave the readable ones alone.
  useEffect(() => {
    // A hidden tab would drain a queue a developer paused in the effects lab.
    const sync = () => {
      if (!queue.isPaused()) queue.setMode(liveMode());
    };
    sync();
    const unsubscribeMotion = motionPreference.subscribe(sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      unsubscribeMotion();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [queue]);

  useEffect(
    () => () => {
      queue.clear();
      topResolutions.clear();
    },
    [queue, topResolutions],
  );

  const fastForwardRef = useRef<() => void>(() => {});
  useEffect(() => {
    devProbeRef.current?.onQueue?.({ queue, fastForward: () => fastForwardRef.current() });
  }, [queue]);

  // Declared before the event effect below so the same commit refreshes the
  // index first: a card is already in its new zone when its movement is narrated.
  useLayoutEffect(() => {
    if (!state) return;
    const cardIds = buildInstanceIndex(state, viewerSeat);
    const seats = buildInstanceSeatIndex(state);
    const arts = buildInstanceArtIndex(state);
    for (const [id, artId] of arts) lastVisibleArtRef.current.set(id, artId);
    sidePanelLookupRef.current = {
      artId: (id) => arts.get(id),
      cardId: (id) => cardIds.get(id),
      seat: (id) => seats.get(id),
    };
    cardSiteRef.current = buildCardSiteIndex(state);
  });

  const { securityCountOf, holdSecurityCard, releaseSecurityCardWhenIdle, releaseSecurityCard } = securityHold({
    queue,
    state,
    setHeldSecurityCards,
  });

  /**
   * The highest figure any scene is still holding for each seat, which is what the shield
   * shows. Several scenes hold at once when one effect spends a run of cards: each holds
   * the figure its own card is the last of, so the max is always the card on stage now.
   */
  const heldSecurityCounts = useMemo(() => {
    const highest = new Map<Seat, number>();
    for (const { seat, count } of heldSecurityCards.values()) {
      highest.set(seat, Math.max(highest.get(seat) ?? 0, count));
    }
    return highest;
  }, [heldSecurityCards]);

  const effectNarrationTracksRef = useRef(new Map<Seat, string>());
  const groupDiscardedSources = useMemo(createDiscardedSourcePanels, []);
  const discardedSourceResolution = useMemo(createDiscardedSourceResolution, []);

  const { narrate, flushHeldNotices, openHeld, narrationBefore, flushTargetClauses } = narrationStream({
    groupDiscardedSources,
    viewerSeat,
    queue,
    cardSiteRef,
    cardSiteAtVersion: (version) => {
      const snapshot = phaseStateRef.current.snapshots?.find((entry) => entry.stateVersion === version);
      return snapshot ? buildCardSiteIndex(snapshot.state) : undefined;
    },
    effectNarrationTracksRef,
    heldOriginsRef,
    enqueuePhaseOrderRef,
    batchVersionsRef,
    narrationPhaseOrdersRef,
    completedPhaseOrderRef,
    presentationReporterRef,
    presentationPacingRef,
    effectSequence,
    narrationSkipRef,
    deletionReadyAtRef,
    optionDockRef,
    releaseTrashArrivalsThrough,
    effectSourceKeyRef,
    effectAnnounceGateRef,
    pendingAnnounceGateRef,
    costClauseRef,
    setEffectSources,
    setNarration,
    collapseNarrationRef,
    narrationLimitRef,
    targetDecisionRef,
    targetClausesRef,
    batchesRef,
    heldNoticesRef,
    heldPanelsRef,
    readOutHeldRef,
    lastBatchIdRef,
    narrationSequenceRef,
    narrationRef,
    awaitEffectConfirmation,
  });

  /* A lit source belongs to the clause it raised: it goes out when that clause does, not
     on a clock of its own. Only a clause that actually reached the screen is followed —
     an activation still waiting for its own is not missing, it is early. */
  useEffect(() => {
    setEffectSources((sources) => {
      const kept = sources.filter(
        (source) => source.linked !== true || source.itemId === undefined || narration.has(source.itemId),
      );
      return kept.length === sources.length ? sources : kept;
    });
  }, [narration]);

  // Questions can release a new clause; each visible toast keeps its arrival clock.
  useLayoutEffect(() => {
    flushTargetClauses();
  }, [decisionPending, targetDecision?.decisionId]);

  // Each record expires on its own clock, including while a chain asks questions. A record
  // the viewer is holding (pointer over it) keeps its clock stopped until released.
  // Schedule only the next expiry, and cancel on unmount or replacement.
  useEffect(() => {
    const running = [...narration.values()].filter((item) => item.pausedAt === undefined);
    if (running.length === 0) return;
    const expiresAt = Math.min(...running.map((item) => item.createdAt + narrationReadingTime(item)));
    const timer = setTimeout(
      () => {
        const now = Date.now();
        setNarration((items) => {
          const kept = new Map(
            [...items].filter(
              ([, item]) => item.pausedAt !== undefined || item.createdAt + narrationReadingTime(item) > now,
            ),
          );
          for (const id of narrationPhaseOrdersRef.current.keys())
            if (!kept.has(id)) narrationPhaseOrdersRef.current.delete(id);
          return kept;
        });
      },
      Math.max(0, expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [narration]);

  // A tightened cap has to be applied to what is already on screen, per column: trimming
  // the map as one list would drop a clause because the other column happened to be full.
  useEffect(() => {
    setNarration((items) =>
      trimNarration(
        items,
        collapseNarrationRef.current ? NARRATION_QUEUE_LIMIT : narrationLimit,
        collapseNarrationRef.current,
      ),
    );
  }, [narrationLimit]);

  /**
   * The board a security check's battle still needs: the attacker standing and suspended,
   * the cards still where the reveal found them. Taken here rather than from
   * `previousDrawStateRef`, which lags a render — that copy predates the declaration, so
   * the attacker it carries stands unsuspended and the board would answer the blow by
   * rotating the dying card upright.
   */
  function blowHoldState(attackerAsRevealed = false): GameState | undefined {
    if (!state) return undefined;
    const live = snapshotGameState(state);
    const attackerId = securityAttackerRef.current?.permanentId;
    const standing = (board: GameState) =>
      board.players.some((player) => player.battleArea.some((permanent) => permanent.permanentId === attackerId));
    if (attackerId === undefined || standing(live)) return live;
    const source = [...(phaseStateRef.current.snapshots ?? [])]
      .reverse()
      .map((snapshot) => snapshot.state)
      .find(standing);
    if (!source) return live;
    // The live board already shows everything that resolved before the reveal; only the
    // attacker the battle is about to delete is put back. Restoring the whole older snapshot
    // would also bring back what the attack's own effects had removed, and stand the attacker
    // as it was before they untapped it.
    const tracked =
      attackSinceDeclarationRef.current?.permanentId === attackerId ? attackSinceDeclarationRef.current : undefined;
    const older = snapshotGameState(source);
    for (const [seatIndex, olderPlayer] of older.players.entries()) {
      const position = olderPlayer.battleArea.findIndex((permanent) => permanent.permanentId === attackerId);
      const livePlayer = live.players[seatIndex];
      if (position < 0 || !livePlayer) continue;
      const attacker = olderPlayer.battleArea[position]!;
      // Suspended as declared until the clauses ahead of the check have been read; the break
      // then stands it up if one of them unsuspended it, so it fights as the server has it.
      attacker.isSuspended = attackerAsRevealed ? (tracked?.suspended ?? true) : true;
      const moved = tracked?.movedInstanceIds;
      if (moved)
        for (let index = attacker.stack.length - 1; index >= 0; index -= 1)
          if (moved.has(attacker.stack[index]!.instanceId)) attacker.stack.splice(index, 1);
      const restored = new Set([attacker.topCard.instanceId, ...attacker.stack.map((card) => card.instanceId)]);
      for (let index = livePlayer.trash.length - 1; index >= 0; index -= 1)
        if (restored.has(livePlayer.trash[index]!.instanceId)) livePlayer.trash.splice(index, 1);
      livePlayer.battleArea.splice(Math.min(position, livePlayer.battleArea.length), 0, attacker);
    }
    return live;
  }

  /** Keeps this batch's trash arrivals out of the pile until a moment of it is narrated. */
  function holdTrashArrivals(fresh: readonly ServerEvent[], stateVersion: number): boolean {
    const bySeat = new Map<Seat, string[]>();
    for (const event of fresh) {
      if (event.kind !== "cardsMoved" || event.to !== "trash") continue;
      for (const instanceId of event.instanceIds) {
        const seat = state?.players.findIndex((player) => player.trash.some((card) => card.instanceId === instanceId));
        if (seat === undefined || seat < 0) continue;
        bySeat.set(seat as Seat, [...(bySeat.get(seat as Seat) ?? []), instanceId]);
      }
    }
    if (bySeat.size === 0) return false;
    setHeldTrashArrivals((held) => {
      const next = new Map(held);
      for (const [seat, instanceIds] of bySeat)
        next.set((trashArrivalKeyRef.current += 1), { seat, instanceIds, stateVersion });
      return next;
    });
    return true;
  }

  function releaseTrashArrivalsThrough(stateVersion: number) {
    setHeldTrashArrivals((held) => {
      if (![...held.values()].some((arrival) => arrival.stateVersion <= stateVersion)) return held;
      return new Map([...held].filter(([, arrival]) => arrival.stateVersion > stateVersion));
    });
  }

  function trackAttackSinceDeclaration(fresh: readonly ServerEvent[]) {
    for (const event of fresh) {
      if (event.kind === "attackDeclared") {
        attackSinceDeclarationRef.current = {
          permanentId: event.attackerPermanentId,
          suspended: true,
          movedInstanceIds: new Set(),
        };
        continue;
      }
      const tracked = attackSinceDeclarationRef.current;
      if (!tracked || event.kind !== "cardsMoved") continue;
      if (event.instanceIds.includes(tracked.permanentId)) {
        if (event.to === "unsuspended") tracked.suspended = false;
        else if (event.to === "suspended") tracked.suspended = true;
        continue;
      }
      // The attacker's own deletion is what the battle draws; its cards stay on the held board.
      if (event.deletedPermanents?.some((deleted) => deleted.permanentId === tracked.permanentId)) continue;
      for (const instanceId of event.instanceIds) tracked.movedInstanceIds.add(instanceId);
    }
  }

  /** The board as it stands at a docked security reveal, before its effect has been read. */
  function securityEffectHoldState(): GameState | undefined {
    const revision = presentationBatchRef.current?.stateVersion;
    const revealBoard =
      revision === undefined ? undefined : snapshots?.find((snapshot) => snapshot.stateVersion === revision)?.state;
    return revealBoard ?? (state ? snapshotGameState(state) : undefined);
  }

  /**
   * Present one server batch. The pass itself lives in `match/present/presentBatch.ts`;
   * this wrapper is where the refs, setters and collaborators it reads are named. They are
   * gathered at call time rather than at render time, because the flight launchers below
   * are declared after the effect that starts the pass.
   */
  function presentBatch(
    batchId: string,
    stateVersion: number,
    fresh: readonly ServerEvent[],
    replayingHistory: boolean,
    continuingBatch = false,
  ) {
    trackAttackSinceDeclaration(fresh);
    const holdsTrash = !replayingHistory && holdTrashArrivals(fresh, stateVersion);
    presentServerBatch({
      batchId,
      stateVersion,
      fresh,
      replayingHistory,
      continuingBatch,
      present: presentBatch,
      presentationPacingRef,
      effectSequence,
      batchOf,
      viewerSeat,
      state,
      snapshots: snapshots ?? [],
      anchors,
      queue,
      progress,
      phaseOrderFor,
      onActionRejected,
      playCue,
      narrate,
      openHeld,
      flushHeldNotices,
      launchDrawFlight,
      launchDeckToUnderFlight,
      flyPublicPileCard,
      flyDockedOptionUnder,
      flyCardToDeck,
      flyCardToHand,
      launchHandTrashFlight,
      releaseTrashArrivalsThrough,
      launchSecurityGainFlight,
      securityCountOf,
      holdSecurityCard,
      releaseSecurityCard,
      releaseSecurityCardWhenIdle,
      enqueuePhaseOrderRef,
      completedPhaseOrderRef,
      lastBatchIdRef,
      presentationBatchRef,
      batchVersionsRef,
      eventfulBoardVersionRef,
      heldOriginsRef,
      fieldClashKeyRef,
      openAttackRef,
      combatLandedRef,
      lastVisibleArtRef,
      revealOnStageRef,
      pendingDigivolutionDrawRef,
      eventDrawCountsRef,
      sidePanelLookupRef,
      discardedSourceResolution,
      sidePanelSequenceRef,
      noticeSequenceRef,
      securityEffectPendingRef,
      securityClausesReadRef,
      showcaseKeyRef,
      revealShowcaseKeyRef,
      cardSiteRef,
      effectSourceKeyRef,
      deckRiffleKeyRef,
      securityGrowthClaimedRef,
      memoryHoldKeyRef,
      presentedTurnSeatRef,
      turnStartDrawRef,
      optionDockKeyRef,
      optionDockRef,
      decisionPendingRef,
      decisionSourceCardIdRef,
      heldNoticesRef,
      heldPanelsRef,
      queuedSecurityKeyRef,
      securityDockRef,
      securityHoldRef,
      securityBlowRef,
      blowHoldState,
      setHeldBlowState,
      securityEffectHoldState,
      setHeldSecurityEffectState,
      securityClauseGateRef,
      causingEffectGateRef,
      effectAnnounceGateRef,
      pendingAnnounceGateRef,
      costClauseRef,
      securityClashKeyRef,
      securityAttackerRef,
      pendingDestructionsRef,
      deleteBurstKeyRef,
      topResolutions,
      deletionReadyAtRef,
      deletionBurstPresentedRef,
      removalChainRef,
      setPendingPermanentIds,
      setZoneShowcase,
      setRevealShowcase,
      setPermanentBursts,
      setEffectSources,
      setDeckRiffles,
      setHeldMemory,
      setAttackAnnouncement,
      setAttackAwaitingCause,
      setSecurityBreak,
      setSecurityHitSeat,
      setSecurityClash,
      setSecurityBranch,
      setPendingRevealKey,
      setOptionBranch,
      setFieldClash,
      setCombatImpactIds,
      setDeleteBursts,
      setHeldDeletions,
      setHeldStackStrips,
    });
    // Whatever happens to the narration, the pile catches up once this batch has played.
    if (holdsTrash) void queue.idle().then(() => releaseTrashArrivalsThrough(stateVersion));
  }

  usePhaseBanners({
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
  });

  useLayoutEffect(() => {
    // Capture the queue before paint so a decision cannot flash over a new batch.
    // The first pass is the baseline: a reconnect replays history, which must not replay
    // its sounds or reopen every panel the match has ever shown. Whatever is already known
    // when the hook first runs is that history, however many batches it spans — and a first
    // pass over nothing still spends the baseline, so a live match narrates its first batch.
    const replayingHistory = !cueBaselineRef.current;
    cueBaselineRef.current = true;
    const pending = batchesAfter(batches, lastCueBatchRef.current);
    if (lastCueBatchRef.current !== undefined && !batches.some((batch) => batch.id === lastCueBatchRef.current))
      deletionBurstPresentedRef.current.clear();
    if (pending.length === 0) return;
    lastCueBatchRef.current = pending.at(-1)!.id;
    lastPresentedSeqRef.current = pending.at(-1)!.events.at(-1)?.seq ?? lastPresentedSeqRef.current;
    // Each batch is its own moment, in order, even when several arrive in one render.
    for (const batch of pending) {
      // Receive passive data before effect-unit gates can stage its scene. A peel may
      // already be running, so its DP handoff cannot wait for another presentation step.
      if (!replayingHistory) topResolutions.record(batch.events);
      try {
        devProbeRef.current?.onBatch?.(batch);
      } catch {
        // Diagnostic transport must never interrupt the presentation.
      }
      enqueuePhaseOrderRef.current = phaseOrderFor(batch.events);
      presentBatch(batch.id, batch.stateVersion, batch.events, replayingHistory);
      effectSequence.noteVersion(batch.stateVersion);
      if (!replayingHistory) {
        for (const event of batch.events) {
          if (event.kind !== "dpModifierApplied" || event.delta === 0) continue;
          dpPulseKeyRef.current += 1;
          const pulse: DpPulse = {
            permanentId: event.permanentId,
            kind: event.delta < 0 ? "debuff" : "buff",
            from: 0,
            to: event.delta,
            key: dpPulseKeyRef.current,
            emphasized: true,
          };
          const causingEffectGate = causingEffectGateRef.current;
          setDpBadgeSuppressions((suppressed) => new Map(suppressed).set(pulse.permanentId, pulse.key));
          queue.enqueue({
            id: `suppressed-dp-pulse-${pulse.key}`,
            track: `dpPulse-${pulse.permanentId}`,
            replace: true,
            async run(context) {
              if (context.mode !== "live") return;
              await waitForGate(causingEffectGate, context, CONSEQUENCE_GATE_MAX_MS, "dpModifierApplied/causingEffect");
              if (context.cancelled) return;
              try {
                setDpPulses((active) => new Map(active).set(pulse.permanentId, pulse));
                await context.wait(1_200);
              } finally {
                setDpPulses((active) => {
                  if (active.get(pulse.permanentId)?.key !== pulse.key) return active;
                  const next = new Map(active);
                  next.delete(pulse.permanentId);
                  return next;
                });
                setDpBadgeSuppressions((suppressed) => {
                  if (suppressed.get(pulse.permanentId) !== pulse.key) return suppressed;
                  const next = new Map(suppressed);
                  next.delete(pulse.permanentId);
                  return next;
                });
              }
            },
          });
        }
      }
    }
    enqueuePhaseOrderRef.current = undefined;
    setConsumedStateVersion(pending.at(-1)!.stateVersion);
    // presentBatch is rebuilt every render and reads only refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batches]);

  /**
   * A check that stopped to ask the viewer something gives up its battle beat. The blow
   * is landed by the check's close, which the server cannot send until the answer comes
   * back, so anything still waiting on that gate — every deletion the check caused —
   * would hold the prompt for the dock's whole ceiling and the match would sit there.
   */
  function handOverSecurityBlow(key: number) {
    const clause = securityClauseGateRef.current;
    if (clause?.key === key) clause.releaseBoard();
    const blow = securityBlowRef.current;
    if (blow === null || blow.key !== key || blow.landed) return;
    blow.landed = true;
    blow.gate.release();
    setHeldBlowState(undefined);
  }

  // A question holds the effect that asked it; what the answer does gets its own beat.
  const askingCardId = decisionPending ? decisionSourceCardId : undefined;
  useEffect(() => {
    if (presentationPacingRef.current === "sequential") effectSequence.noteQuestion(askingCardId);
  }, [askingCardId, effectSequence]);

  const resultPending = useResultHold({
    gameOver: state?.gameOver === true,
    gameOverPresented: batches.some((batch) => batch.events.some((event) => event.kind === "gameOver")),
    playbackPending,
    lastClauseAt: narration.size > 0 ? Math.max(...[...narration.values()].map((item) => item.createdAt)) : undefined,
    queueActivity,
    queue,
  });

  useDecisionBarrier({
    pendingEffectUnits: () => effectSequence.pendingCount(),
    decisionPending,
    decisionStateVersion,
    decisionAnimationsPending,
    decisionStalled,
    decisionBarrier,
    presentedStateVersion,
    pendingRevealKey,
    queueActivity,
    queue,
    progress,
    flushHeldNotices,
    securityHoldRef,
    handOverSecurityBlow,
    setDecisionBarrier,
    setDecisionStalled,
    setPendingRevealKey,
  });

  /*
   * The cause of what the live state shows. The server sends a batch's state patch ahead of
   * the batch's close, so a watcher can see a hand grow or a DP change before the batch that
   * did it has been presented, while the gate at hand still belongs to an earlier effect.
   * Under sequential pacing such a change waits for its own batch's effect instead.
   */
  const liveStateCauseRef = useMemo(
    () => ({
      get current(): PresentationGate | null {
        const liveVersion = liveStateVersionRef.current;
        if (presentationPacingRef.current !== "sequential" || liveVersion === undefined)
          return causingEffectGateRef.current;
        if (liveVersion > effectSequence.observedVersion()) return effectSequence.causeOfLiveChange(liveVersion);
        const watchedVersion = watchedLiveVersionRef.current;
        return (
          (watchedVersion !== undefined && watchedVersion < liveVersion
            ? effectSequence.causeOfObservedChange(watchedVersion)
            : undefined) ?? causingEffectGateRef.current
        );
      },
      set current(gate: PresentationGate | null) {
        causingEffectGateRef.current = gate;
      },
    }),
    [effectSequence],
  );

  /*
   * The queue as the live-state watchers see it. A watcher reacts to the newest server state,
   * so its cue belongs to the newest phase this client has heard of, not to the last phase
   * whose ribbon finished. Stamped with that older phase, a DP pulse caused by a start-of-main
   * effect became a prerequisite of the Main ribbon while it waited on that effect's clause,
   * and the effect waited on the ribbon: every track froze until the gate ceilings ran out.
   */
  const liveStateQueue = useMemo<AnimationQueue>(
    () => ({
      ...queue,
      enqueue(step) {
        const batchPhaseOrder = enqueuePhaseOrderRef.current;
        enqueuePhaseOrderRef.current = Math.max(
          batchPhaseOrder ?? completedPhaseOrderRef.current,
          nextPhaseOrderRef.current,
        );
        try {
          queue.enqueue(step);
        } finally {
          enqueuePhaseOrderRef.current = batchPhaseOrder;
        }
      },
    }),
    [queue],
  );

  function getPresentationRevisionContext(stateVersion: number) {
    const batch = batches.find((candidate) => candidate.stateVersion === stateVersion);
    return {
      gate:
        stateVersion > effectSequence.observedVersion()
          ? effectSequence.causeOfLiveChange(stateVersion)
          : (effectSequence.causeOfObservedChange(stateVersion - 1, stateVersion) ?? null),
      ...(batch ? { origin: { batchId: batch.id, stateVersion, phaseOrder: phaseOrderFor(batch.events) } } : {}),
    };
  }

  useDpPulses({
    state,
    preserveChanges: presentationPacing === "sequential",
    snapshots,
    contextOfRevision: getPresentationRevisionContext,
    queue: liveStateQueue,
    dpByPermanentRef,
    dpPulseKeyRef,
    causingEffectGateRef: liveStateCauseRef,
    stackStripKeyRef: deleteBurstKeyRef,
    setDpPulses,
    setDpBadgeSuppressions,
  });

  useRestrictionPulses({
    state,
    snapshots: presentationPacing === "sequential" ? snapshots : undefined,
    contextOfRevision: presentationPacing === "sequential" ? getPresentationRevisionContext : undefined,
    queue: liveStateQueue,
    restrictionsByPermanentRef,
    freezePulseKeyRef,
    causingEffectGateRef: liveStateCauseRef,
    setFreezePulses,
  });

  const you = state?.players[viewerSeat];
  const opp = state?.players[otherSeat(viewerSeat)];
  const {
    launchSecurityGainFlight,
    launchOpeningSecurityDeal,
    launchDrawFlight,
    launchDeckToUnderFlight,
    flyPublicPileCard,
    flyCardUnder,
    flyCardToDeck,
    flyCardToHand,
    launchHandTrashFlight,
  } = cueFlights({
    queue,
    anchors,
    presentationBatchRef,
    viewerSeat,
    causingEffectGateRef,
    stackStripKeyRef: deleteBurstKeyRef,
    securityGainKeyRef,
    drawFlightKeyRef,
    setSecurityFlights,
    setSecurityDealCounts,
    setDrawFlights,
    setDrawBursts,
    setHeldHandArrivals,
  });

  /** The docked Option card, drawn over the board, flies into the permanent it went under. */
  function flyDockedOptionUnder(card: DrawFlightCard, permanentId: string, context: AnimationStepContext) {
    const docked = anchors.board.current?.ownerDocument.querySelector(
      '[data-testid="security-branch"][data-source="option"]',
    );
    return docked ? flyCardUnder(card, docked, permanentId, context) : Promise.resolve(false);
  }

  // State watchers use the newest phase and that snapshot's cause, including security growth.
  const { launchDrawFlight: launchWatchedDrawFlight, launchSecurityGainFlight: launchWatchedSecurityGainFlight } =
    cueFlights({
      queue: liveStateQueue,
      anchors,
      viewerSeat,
      causingEffectGateRef: liveStateCauseRef,
      stackStripKeyRef: deleteBurstKeyRef,
      presentationBatchRef,
      securityGainKeyRef,
      drawFlightKeyRef,
      setSecurityFlights,
      setSecurityDealCounts,
      setDrawFlights,
      setDrawBursts,
      setHeldHandArrivals,
    });

  useDrawWatcher({
    state,
    snapshots,
    viewer: you,
    opponent: opp,
    viewerSeat,
    mulliganOpen,
    phaseBanner,
    drawPhaseWaitingRef,
    previousDrawStateRef,
    handCountsRef,
    turnStartDrawRef,
    eventDrawCountsRef,
    launchDrawFlight: (side, turnStart, waitBeforeMs, card, arrived, draw) =>
      launchWatchedDrawFlight(side, turnStart, waitBeforeMs, card, arrived, draw, deleteBurstKeyRef.current),
  });

  useSecurityCountWatcher({
    viewer: you,
    opponent: opp,
    viewerSeat,
    mulliganOpen,
    securityCountsRef,
    openingSecurityDealRef,
    securityGrowthClaimedRef,
    stateVersion: state?.stateVersion,
    noticeSequenceRef,
    lastBatchIdRef,
    growthNamedAhead: (seat) =>
      (phaseEvents ?? []).some(
        (event) =>
          "seq" in event &&
          (event as SequencedServerEvent).seq > lastPresentedSeqRef.current &&
          securityGrowthSeatOf(event) === seat,
      ),
    launchOpeningSecurityDeal,
    launchSecurityGainFlight: launchWatchedSecurityGainFlight,
    narrate,
  });

  // Declared after every state watcher, so each of them compared against the previous revision.
  useEffect(() => {
    watchedLiveVersionRef.current = state?.stateVersion;
  }, [state?.stateVersion]);

  /** The items on screen, in slot order, so the read-only views below are stable. */
  const presented = useMemo(() => [...narration.values()], [narration]);

  // Recent records are informational; board synchronization owns the input barrier.
  const narrationLock = false;

  const sidePanels = useMemo(() => presented.flatMap((item) => (item.panel ? [item.panel] : [])), [presented]);
  const notices = useMemo(
    () => [...presented.flatMap((item) => (item.notice ? [item.notice] : [])), ...(rejection ? [rejection] : [])],
    [presented, rejection],
  );

  /** Dismiss one record, defaulting to the oldest for keyboard callers. */
  function advanceNarration(id?: string): boolean {
    const target = id ?? narration.keys().next().value;
    if (target === undefined || !narration.has(target)) return false;
    presentationTelemetry.countManualAdvance();
    setNarration((items) => {
      const next = new Map(items);
      next.delete(target);
      return next;
    });
    return true;
  }

  /** Stop every reading clock while the viewer reads, and restart them where they left off. */
  function holdNarration(held: boolean) {
    viewerReadingRef.current = held;
    applyReadingHold();
  }

  function applyReadingHold() {
    const held = viewerReadingRef.current || effectConfirmationRef.current !== null;
    if (held === readingHeldRef.current) return;
    readingHeldRef.current = held;
    setNarration((items) => (held ? pauseNarration(items, Date.now()) : resumeNarration(items, Date.now())));
  }

  function awaitEffectConfirmation(context: AnimationStepContext): Promise<void> | undefined {
    if (!holdEffectsRef.current || context.mode !== "live" || context.skipping || context.cancelled) return undefined;
    effectConfirmationRef.current?.();
    return new Promise<void>((resolve) => {
      effectConfirmationRef.current = () => {
        effectConfirmationRef.current = null;
        setEffectAwaitingConfirmation(false);
        applyReadingHold();
        queue.resume();
        resolve();
      };
      queue.pause();
      applyReadingHold();
      setEffectAwaitingConfirmation(true);
    });
  }

  function confirmEffect() {
    effectConfirmationRef.current?.();
  }

  /**
   * Collapse everything still queued: skippable waits go to nothing and every item still
   * to be read is dropped rather than narrated. The match log keeps all of them, so a
   * player who asked to fast-forward loses nothing they cannot read back.
   */
  function fastForwardWithFilter(eligible?: (step: AnimationStep) => boolean) {
    presentationTelemetry.countSkip();
    confirmEffect();
    narrationSkipRef.current = true;
    targetClausesRef.current.clear();
    effectSequence.skipClauses();
    narrationPhaseOrdersRef.current.clear();
    setNarration(new Map());
    queue.skip(eligible);
    void queue.idle().then(() => {
      narrationSkipRef.current = false;
    });
  }
  function fastForward() {
    fastForwardWithFilter();
  }
  fastForwardRef.current = fastForward;

  // Refusals expire independently of the recent effect records.
  useEffect(() => {
    if (!rejection) return;
    const remaining = noticeRemaining(rejection, Date.now());
    const timer = setTimeout(() => setRejection((current) => (current === rejection ? null : current)), remaining);
    return () => clearTimeout(timer);
  }, [rejection]);

  // A patch can arrive before batchClosed. Reserve incoming draws immediately:
  // the batch's measured flight takes over this hold before the next paint.
  const incomingHandArrivals = new Map(heldHandArrivals);
  if (cueBaselineRef.current && liveMode() === "live" && state?.phase !== Phase.None && !mulliganOpen) {
    const closed = new Set(batches.map((batch) => batch.id));
    const opaqueClaims = new Map<Seat, number>();
    for (const hold of heldHandArrivals.values()) {
      const player = state?.players[hold.seat];
      if (
        !hold.instanceId &&
        player &&
        hold.stateVersion <= state!.stateVersion &&
        hold.handCountAfter <= player.handCount &&
        hold.deckCountAfter >= player.deckCount
      )
        opaqueClaims.set(hold.seat, (opaqueClaims.get(hold.seat) ?? 0) + 1);
    }
    let incomingKey = -1;
    for (const event of phaseEvents ?? []) {
      if (
        event.kind !== "cardsMoved" ||
        event.from !== "deck" ||
        event.to !== "hand" ||
        event.handAddition === "staging" ||
        event.seat === undefined ||
        !("batch" in event) ||
        typeof event.batch !== "string" ||
        !("seq" in event) ||
        typeof event.seq !== "number" ||
        !("stateVersion" in event) ||
        typeof event.stateVersion !== "number" ||
        closed.has(event.batch) ||
        batchVersionsRef.current.has(event.batch)
      )
        continue;
      const player = state?.players[event.seat];
      if (!player) continue;
      // Opaque opponent identities cannot prove the draw has reached the patch.
      // Events are stamped before batchClosed advances the authoritative revision.
      if (event.seat !== viewerSeat && state!.stateVersion <= event.stateVersion) continue;
      for (const instanceId of event.instanceIds) {
        if (
          [...incomingHandArrivals.values()].some((hold) => hold.seat === event.seat && hold.instanceId === instanceId)
        )
          continue;
        const opaque = opaqueClaims.get(event.seat) ?? 0;
        if (opaque > 0) {
          opaqueClaims.set(event.seat, opaque - 1);
          continue;
        }
        incomingHandArrivals.set(incomingKey--, {
          seat: event.seat,
          instanceId,
          stateVersion: event.stateVersion,
          handCountAfter: player.handCount,
          deckCountAfter: player.deckCount,
        });
      }
    }
    // Colyseus can mutate hand/deck fields before either React publishes the raw
    // events or the batch increments its version. Compare physical membership
    // against the frozen closed revision, including patches at that same version.
    const closedVersion = batches.at(-1)?.stateVersion ?? snapshots?.[0]?.stateVersion;
    const closedState = snapshots?.find((snapshot) => snapshot.stateVersion === closedVersion)?.state;
    const previous = closedState?.players[viewerSeat];
    const current = state?.players[viewerSeat];
    if (previous && current?.hand && closedVersion !== undefined && state!.stateVersion >= closedVersion) {
      const deckDraws = Math.max(0, previous.deckCount - current.deckCount);
      const known = new Set(previous.hand?.map((card) => card.instanceId));
      const pending = new Set(
        [...incomingHandArrivals.values()].filter((hold) => hold.seat === viewerSeat).map((hold) => hold.instanceId),
      );
      const staged = new Set(
        (phaseEvents ?? []).flatMap((event) =>
          event.kind === "cardsMoved" &&
          event.handAddition === "staging" &&
          event.seat === viewerSeat &&
          "batch" in event &&
          typeof event.batch === "string" &&
          !closed.has(event.batch) &&
          !batchVersionsRef.current.has(event.batch)
            ? event.instanceIds
            : [],
        ),
      );
      const added = current.hand.filter((card) => !known.has(card.instanceId) && !staged.has(card.instanceId));
      let incoming = added.slice(-deckDraws);
      if (deckDraws === 0) {
        incoming = state!.stateVersion === closedVersion ? added : [];
      }
      for (const card of incoming) {
        if (pending.has(card.instanceId)) continue;
        incomingHandArrivals.set(incomingKey--, {
          seat: viewerSeat,
          instanceId: card.instanceId,
          fromDeck: deckDraws > 0,
          stateVersion: state!.stateVersion,
          handCountAfter: current.handCount,
          deckCountAfter: current.deckCount,
        });
      }
    }
  }

  return {
    narration,
    rejection,
    dismissRejection: () => setRejection(null),
    advanceNarration,
    holdNarration,
    narrationLock,
    sidePanels,
    notices,
    raiseRejection: (reason: string) => {
      noticeSequenceRef.current += 1;
      setRejection(rejectionNotice(reason, `notice-${noticeSequenceRef.current}`, Date.now()));
    },
    attackAnnouncement,
    attackAwaitingCause,
    turnTransition,
    securityClash,
    securityBreak,
    securityBranch,
    optionBranch,
    securityRevealPending: pendingRevealKey !== null,
    decisionBarrierPending: decisionBarrier !== null,
    decisionAnimationsPending: decisionAnimationsPending && !decisionStalled,
    playbackPending,
    consumedStateVersion,
    presentedStateVersion,
    presenting: presentedStateVersion !== undefined || pendingPhaseBanners > 0,
    resultPending,
    unsuspendSweep,
    deleteBursts,
    zoneShowcase,
    revealShowcase,
    permanentBursts,
    pendingPermanentIds,
    effectSources,
    deckRiffles,
    securityFlights,
    securityDealCounts,
    phaseBanner,
    phaseTransitionPending: pendingPhaseBanners > 0,
    heldDrawState,
    heldPhaseState,
    heldMemory,
    heldBlowState,
    heldSecurityEffectState,
    heldBreedingState,
    heldDeletions,
    heldStackStrips,
    heldTrashArrivals,
    heldHandArrivals: incomingHandArrivals,
    displayedPhase: pendingPhaseBanners > 0 ? announcedPhase : state?.phase,
    displayedTurn: pendingPhaseBanners > 0 ? announcedTurn : state && { seat: state.turnSeat, count: state.turnCount },
    heldSuspendedIds,
    combatImpactIds,
    fieldClash,
    dpPulses,
    dpBadgeSuppressedIds: new Set(dpBadgeSuppressions.keys()),
    freezePulses,
    securityHitSeat,
    heldSecurityCounts,
    drawFlights,
    drawBursts,
    playCue,
    skipAnimations: fastForward,
    effectAwaitingConfirmation,
    confirmEffect,
  };
}
