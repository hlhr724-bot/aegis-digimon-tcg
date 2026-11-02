import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { DecisionRequest, PresentationReport, Seat } from "@aegis/shared";
import type { AnimationQueue, AnimationStep, AnimationStepContext } from "../../animationQueue";
import {
  buildNarrationItems,
  NARRATION_QUEUE_LIMIT,
  isCardListNotice,
  pushNarrationItem,
  supersedeEffectClauses,
  type NarrationItem,
} from "../../narration";
import type { MatchNotice } from "../../notices";
import type { SidePanel } from "../../sidePanels";
import { effectActivationPreparationMs, type EffectActivation, type EffectSourceLookup } from "../../effectSource";
import { otherSeat } from "../../boardModel";
import { TIMINGS } from "../../timings";
import { waitForTrashSourceClock } from "../present/trashSourceClock";
import { waitForHandSourceClock } from "../present/handSourceClock";
import { EFFECT_SPEED_SCALE, getEffectSpeed } from "../../pacing";
import type { PresentationPacing } from "../../presentationProbe";
import { activePacing } from "../../pacing";
import { announceMsFor, sequentialSourceHoldMs, type EffectSequence } from "../effectSequence";
import type { OptionDockHold } from "../present/optionDock";
import { presentableNarration } from "./presentableNarration";
import { hasEarlierClauseResults } from "./targetClause";
import type { ServerBatch } from "../../../net/serverBatches";
import {
  CONSEQUENCE_GATE_MAX_MS,
  QUEUED_GATE_MAX_MS,
  createPresentationGate,
  waitForGate,
  type DeletionReadyAt,
  type CostClause,
  type PendingAnnounceGate,
  type PresentationGate,
} from "../presentationGate";

/**
 * Where a spawned narration step goes in its track.
 *
 * A cue that reads out notices from INSIDE its own run — a security dock reading the clause
 * of the card it holds — sets `next`, so the clause lands right behind the cue that raised it
 * rather than behind every later check the server has shipped in the meantime.
 */
export interface NarrationPlacement {
  next?: boolean;
  /**
   * The raising cue holds the centre until its clause has been read, so the clause must not
   * queue behind it: it goes on the plain narration track, whatever track the seat's earlier
   * clauses followed. Without it an [On Play] still pending on the centre stage pulled the
   * clause in behind the very dock that was waiting to see it.
   */
  beside?: boolean;
  /** Queue ahead of clauses from later batches only, rather than at the back of the track. */
  inBatchOrder?: boolean;
}

export interface NarrationStreamDeps {
  groupDiscardedSources: (item: NarrationItem) => NarrationItem;
  viewerSeat: Seat;
  queue: AnimationQueue;
  cardSiteRef: MutableRefObject<{
    locate: EffectSourceLookup;
    seatOf: (instanceId: string) => Seat | undefined;
    topInstanceOf: (permanentId: string) => string | undefined;
  }>;
  /** Freeze a queued clause's source against its own recorded board, before later results move it. */
  cardSiteAtVersion: (version: number | undefined) => { locate: EffectSourceLookup } | undefined;
  effectNarrationTracksRef: MutableRefObject<Map<Seat, string>>;
  heldOriginsRef: MutableRefObject<WeakMap<object, { batchId: string; stateVersion: number; phaseOrder: number }>>;
  enqueuePhaseOrderRef: MutableRefObject<number | undefined>;
  batchVersionsRef: MutableRefObject<Map<string, number>>;
  narrationPhaseOrdersRef: MutableRefObject<Map<string, number>>;
  completedPhaseOrderRef: MutableRefObject<number>;
  presentationReporterRef: MutableRefObject<((report: PresentationReport) => void) | undefined>;
  /** How simultaneous effects are paced. */
  presentationPacingRef: MutableRefObject<PresentationPacing>;
  /** The effect units sequential pacing plays one at a time. */
  effectSequence: EffectSequence;
  narrationSkipRef: MutableRefObject<boolean>;
  deletionReadyAtRef: MutableRefObject<Map<string, DeletionReadyAt>>;
  /** The Option on screen; what the server did after routing it waits for the card to leave. */
  optionDockRef: MutableRefObject<OptionDockHold | null>;
  /** Lets the trash show the cards up to this batch, now that its moment is on screen. */
  releaseTrashArrivalsThrough: (stateVersion: number) => void;
  effectSourceKeyRef: MutableRefObject<number>;
  /** The announcement this batch is still holding its consequences behind. */
  effectAnnounceGateRef: MutableRefObject<PresentationGate | null>;
  /** A gate a batch armed before it knew which clause would carry it. */
  pendingAnnounceGateRef: MutableRefObject<PendingAnnounceGate | null>;
  /** The ＜Delay＞ clause whose Option break, toast and played card are being kept in order. */
  costClauseRef: MutableRefObject<CostClause | null>;
  setEffectSources: Dispatch<SetStateAction<readonly EffectActivation[]>>;
  setNarration: Dispatch<SetStateAction<ReadonlyMap<string, NarrationItem>>>;
  collapseNarrationRef: MutableRefObject<boolean>;
  narrationLimitRef: MutableRefObject<number>;
  targetDecisionRef: MutableRefObject<DecisionRequest | undefined>;
  targetClausesRef: MutableRefObject<Map<string, () => void>>;
  batchesRef: MutableRefObject<readonly ServerBatch[]>;
  heldNoticesRef: MutableRefObject<readonly MatchNotice[]>;
  heldPanelsRef: MutableRefObject<readonly SidePanel[]>;
  /** Held items a cue has already read out, so a second cue promised the same item skips it. */
  readOutHeldRef: MutableRefObject<WeakSet<object>>;
  lastBatchIdRef: MutableRefObject<string>;
  narrationSequenceRef: MutableRefObject<number>;
  narrationRef: MutableRefObject<ReadonlyMap<string, NarrationItem>>;
  awaitEffectConfirmation: (context: AnimationStepContext) => Promise<void> | undefined;
}

type NarrationTrackParams = {
  unitId: number | undefined;
  resultUnitId: number | undefined;
  sharedTrack: string;
};

function narrationTrack({ unitId, resultUnitId, sharedTrack }: NarrationTrackParams): string {
  if (unitId !== undefined) return `effectClause-${unitId}`;
  if (resultUnitId !== undefined) return `effectResults-${resultUnitId}`;
  return sharedTrack;
}

type NarrationCauseGateParams = {
  isClause: boolean;
  resultAnnouncement: PresentationGate | undefined;
  latestAnnouncement: PresentationGate | null;
  itemVersion: number | undefined;
  latestAnnouncementVersion: number | undefined;
};

function narrationCauseGate({
  isClause,
  resultAnnouncement,
  latestAnnouncement,
  itemVersion,
  latestAnnouncementVersion,
}: NarrationCauseGateParams): PresentationGate | null {
  if (isClause) return null;
  if (resultAnnouncement) return resultAnnouncement;
  if (itemVersion !== undefined && latestAnnouncementVersion !== undefined && latestAnnouncementVersion > itemVersion)
    return null;
  return latestAnnouncement;
}

/** An effect's draw on its way to the hand; a turn's own draw is no clause's result. */
function isEffectDrawFlight(step: AnimationStep): boolean {
  return step.id.startsWith("draw-flight-") && step.track?.startsWith("drawFlight-") === true;
}

function pendingStepIds(queue: AnimationQueue, predicate: (step: AnimationStep) => boolean): Set<string> {
  const ids = new Set<string>();
  queue.countPendingSteps((step) => {
    if (predicate(step)) ids.add(step.id);
    return false;
  });
  return ids;
}

/** The revision of the batch whose clause armed each announcement gate. */
const announceGateVersions = new WeakMap<PresentationGate, number>();

/** A decision identifies the physical source and exact clause, never every copy of its card. */
function waitsForTargets(
  notice: MatchNotice | undefined,
  decision: DecisionRequest | undefined,
  viewerSeat: Seat,
): boolean {
  const body = notice?.body;
  if (!decision || decision.seat !== viewerSeat || notice?.side !== "you" || body?.variant !== "effect") return false;
  if (body.cardId !== decision.sourceCardId) return false;
  if (decision.options?.effectKey && body.effectKey && body.effectKey !== decision.options.effectKey) return false;
  if (decision.sourceInstanceId && body.sourceInstanceId !== decision.sourceInstanceId) return false;
  if (decision.sourcePermanentId && body.sourcePermanentId !== decision.sourcePermanentId) return false;
  return true;
}

export function narrationStream(deps: NarrationStreamDeps) {
  const {
    groupDiscardedSources,
    viewerSeat,
    queue,
    cardSiteRef,
    cardSiteAtVersion,
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
  } = deps;

  /** Publish the clause before the results queued behind its arrival. */
  function enqueueNarrationItem(
    item: NarrationItem,
    effectSourceHoldMs: number = TIMINGS.effectSourceHold,
    opts?: NarrationPlacement,
  ) {
    const body = item.notice?.body;
    const seat = item.side === "you" ? viewerSeat : otherSeat(viewerSeat);
    const heldOrigin = heldOriginsRef.current.get(item.notice ?? item.panel ?? item);
    const itemVersion = heldOrigin?.stateVersion ?? batchVersionsRef.current.get(item.batchId);
    const sourceIndex = cardSiteAtVersion(itemVersion);
    const initialSite =
      body?.variant === "effect" ? (sourceIndex ?? cardSiteRef.current).locate(body.cardId, seat, body) : undefined;
    const timing = body?.variant === "effect" ? (body.timing ?? "") : "";
    const reactsToDeletion = body?.variant === "effect" && /delet|destroy/i.test(body.triggerTiming ?? "");
    // The server may close the deletion and its reaction in separate batches. Capture the
    // latest deletion now, before a later batch can register another burst.
    const precedingDeletion =
      reactsToDeletion && !item.notice?.afterDeletions?.length
        ? [...deletionReadyAtRef.current.values()].at(-1)
        : undefined;
    // Follow the actual arrival track, including its field burst, rather than
    // estimating when a normal play or evolution will be finished.
    const followsArrival = /on.?play|when.?digivolving/i.test(timing) && initialSite?.zone === "field";
    // A security cue replaces the visual centre stage. Accepted clauses must
    // survive that replacement, and cannot own the burst track they await.
    const arrivalTrack = followsArrival ? `arrival-narration-${initialSite.permanentId}` : undefined;
    // A mechanic call-out ("DigiXros!") names the play itself, so it is never the consequence
    // of an effect. Waiting on the latest announcement would wait on the [On Play] that the
    // same play raised, which queues behind this call-out and deadlocks until the ceiling.
    const latestAnnounceGate = body?.variant === "keyword" ? null : effectAnnounceGateRef.current;
    const pending = pendingAnnounceGateRef.current;
    const adopted =
      body?.variant === "effect" &&
      pending?.batchId === item.batchId &&
      ((body.description?.startsWith("[Granted]") && !/delet|destroy/i.test(body.triggerTiming ?? "")) ||
        !pending.deleted.has(`${seat}:${body.cardId}`))
        ? pending.gate
        : null;
    const announceGate = body?.variant === "effect" ? (adopted ?? createPresentationGate()) : null;
    if (adopted) pendingAnnounceGateRef.current = null;
    const pendingCostClause = costClauseRef.current;
    const costClause =
      body?.variant === "effect" &&
      pendingCostClause?.sourceKey === `${seat}:${body.cardId}` &&
      (body.sourcePermanentId === undefined || body.sourcePermanentId === pendingCostClause.permanentId) &&
      !pendingCostClause.read.open
        ? pendingCostClause
        : null;
    // A clause is only the consequence of an announcement from its own batch or an earlier one.
    // A later batch's announcement is queued behind this item — a security dock reads its own
    // clause out ahead of the [On Play] the next batch raised — so waiting on it deadlocks
    // until the ceiling.
    const latestAnnounceVersion = latestAnnounceGate ? announceGateVersions.get(latestAnnounceGate) : undefined;
    // Sequential pacing: this clause is its unit's announcement, and the unit ahead of it has
    // to settle before it is read. That order supersedes the latest-announcement wait.
    const unit = presentationPacingRef.current === "sequential" ? effectSequence.unitOf(item.notice) : undefined;
    const resultUnit =
      presentationPacingRef.current === "sequential" && itemVersion !== undefined && body?.variant !== "keyword"
        ? effectSequence.unitAtVersion(itemVersion)
        : undefined;
    // A later answer may replace the unit's announcement gate while this step is
    // still finishing. This clause can release only the gate it was raised for.
    const unitAnnouncement = unit?.announced;
    // Paying Delay precedes this unit's clause, but still follows the earlier units.
    // Its own ceiling starts when this unit may focus, not while those units are reading.
    if (unit && costClause) costClause.focused.after = unit.started;
    const causingEffectGate = narrationCauseGate({
      isClause: unit !== undefined,
      resultAnnouncement: resultUnit?.announced,
      latestAnnouncement: latestAnnounceGate,
      itemVersion,
      latestAnnouncementVersion: latestAnnounceVersion,
    });
    if (announceGate) {
      effectAnnounceGateRef.current = announceGate;
      if (itemVersion !== undefined) announceGateVersions.set(announceGate, itemVersion);
      // What waits on this clause waits behind the effects ahead of its unit, so its ceiling
      // only starts once the unit has started.
      if (unit && !announceGate.after) announceGate.after = unit.started;
    }
    if (arrivalTrack) effectNarrationTracksRef.current.set(seat, arrivalTrack);
    const precedingTrack = effectNarrationTracksRef.current.get(seat);
    const sharedTrack =
      body?.variant === "keyword" || opts?.beside || reactsToDeletion
        ? "narration"
        : (arrivalTrack ??
          (precedingTrack && queue.hasPendingStep((step) => step.track === precedingTrack)
            ? precedingTrack
            : "narration"));
    /* Sequential pacing: a unit's clause gets a track of its own. On a shared track it
       would wait behind whatever queued there first, and under sequential pacing what
       queued first is often a later effect: its clause, or a result waiting for that clause.
       A security dock reads its card's clause only when it docks, after the server's later
       batches have queued, so the earlier clause sat behind a later one that sat waiting on
       the earlier effect, until a ceiling broke the cycle. The unit order already keeps
       clauses in turn; the wait below keeps one behind its card's arrival. */
    const ownTrack = unit !== undefined;
    const track = narrationTrack({ unitId: unit?.id, resultUnitId: resultUnit?.id, sharedTrack });
    // The same permanent may evolve because of this very On Play. That future arrival
    // waits for this clause, so waiting on its id alone creates a cycle. An originless
    // physical arrival remains supported for legacy recipes; generic tracks need proof.
    const noLaterThanClause = (step: AnimationStep) =>
      step.origin?.stateVersion === undefined || itemVersion === undefined || step.origin.stateVersion <= itemVersion;
    const arrivalAhead = (step: AnimationStep) =>
      (initialSite?.zone === "field" &&
        step.arrivingPermanentId === initialSite.permanentId &&
        noLaterThanClause(step)) ||
      (step.track === arrivalTrack &&
        step.origin?.stateVersion !== undefined &&
        // A generic centre-track item in the clause's own batch may be a result
        // panel waiting for this announcement. Only an earlier batch proves a
        // generic arrival; a same-batch physical landing names its permanent.
        step.origin.stateVersion < (itemVersion ?? 0));
    const origin = {
      phaseOrder: heldOrigin?.phaseOrder ?? enqueuePhaseOrderRef.current,
      batchId: item.batchId,
      stateVersion: itemVersion ?? 0,
      ...(body?.variant === "effect" ? { sourceCardId: body.cardId, timing: body.timing } : {}),
    };
    // Which phase raised the clause is what lets the ribbon that follows it wait for its
    // beat and then clear it (`waitForPhasePrerequisites`).
    narrationPhaseOrdersRef.current.set(item.id, origin.phaseOrder ?? completedPhaseOrderRef.current);
    function reportShown(stepId: string, context: AnimationStepContext) {
      try {
        presentationReporterRef.current?.({
          ...origin,
          phase: "shown",
          stepId,
          track,
          clientTimestamp: Date.now(),
          mode: context.mode,
          cancelled: context.cancelled,
          skipping: context.skipping,
          failed: false,
          pendingCount: queue.pendingCount(),
        });
      } catch {
        // Diagnostic transport must never interrupt the presentation.
      }
    }
    if (unit) effectSequence.markClauseStep(`narration-step-${item.id}`);
    // A clause is read once the board shows what the clauses before it did. Without this, the
    // next Yoshino's clause lit up while the previous one's draw was still in the air.
    // Draws from this clause's own batch wait for its announcement gate; waiting on them
    // here would cycle until the timeout and let the security check overtake the clause.
    const earlierDrawFlights =
      body?.variant === "effect"
        ? pendingStepIds(
            queue,
            (step) =>
              (isEffectDrawFlight(step) &&
                (step.origin?.stateVersion === undefined ? !unit : step.origin.stateVersion < (itemVersion ?? 0))) ||
              (step.track === "handTrash" &&
                (step.origin?.stateVersion === undefined || step.origin.stateVersion <= (itemVersion ?? 0))),
          )
        : new Set<string>();
    const earlierDrawGate = earlierDrawFlights.size > 0 && !costClause ? createPresentationGate() : undefined;
    if (earlierDrawGate) {
      earlierDrawGate.after = unit?.started ?? announceGate?.after;
      if (unitAnnouncement) unitAnnouncement.after = earlierDrawGate;
      if (announceGate) announceGate.after = earlierDrawGate;
    }
    queue.enqueue({
      id: `narration-step-${item.id}`,
      origin,
      track,
      ...(opts?.next === true ? { next: true } : {}),
      ...(opts?.inBatchOrder === true && itemVersion !== undefined
        ? {
            ahead: (step: AnimationStep) =>
              step.origin?.stateVersion !== undefined && step.origin.stateVersion > itemVersion,
          }
        : {}),
      holdsBoard: false,
      blocksDecision: false,
      onDiscard() {
        earlierDrawGate?.release();
        announceGate?.release();
        unitAnnouncement?.release();
        costClause?.focused.release();
        costClause?.read.release();
      },
      async run(context) {
        /* The source card is lit before its clause and stays lit until the clause leaves
           (the prune in `useMatchCues`). A run that ends before the clause is ever published —
           cancelled, skipped, or nothing presentable left — owns the light it turned on,
           because no clause will arrive for the prune to follow. */
        let activation: EffectActivation | undefined;
        let linked = false;
        try {
          await runNarrationStep();
        } finally {
          earlierDrawGate?.release();
          announceGate?.release();
          unitAnnouncement?.release();
          costClause?.focused.release();
          costClause?.read.release();
          if (activation && !linked) {
            const key = activation.key;
            setEffectSources((sources) => sources.filter((source) => source.key !== key));
          }
        }

        async function runNarrationStep() {
          if (context.mode === "replay" || narrationSkipRef.current) return;
          await waitForGate(causingEffectGate, context, CONSEQUENCE_GATE_MAX_MS, "narration/causingEffect");
          if (unit) await waitForGate(unit.started, context, QUEUED_GATE_MAX_MS, "narration/effectUnit");
          if (context.cancelled || narrationSkipRef.current) return;
          if (ownTrack && arrivalTrack === sharedTrack)
            while (
              queue.hasPendingStep(arrivalAhead) &&
              context.mode === "live" &&
              !context.cancelled &&
              !context.skipping
            )
              await context.wait(16);
          // What an earlier batch deleted breaks before this moment is read: an Option's
          // deletion before the [When Attacking] clause that follows it. The deleting batch's
          // own items are left alone, since its shatter may be waiting on one of them — except
          // when a docked Option, not a clause, explains the deletion: then its "Deleted"
          // panel waits for the shatter too.
          if (context.mode === "live" && itemVersion !== undefined) {
            await Promise.resolve();
            for (const deletion of [...deletionReadyAtRef.current.values()]) {
              const version = deletion.stateVersion;
              const waits =
                version !== undefined &&
                (version < itemVersion ||
                  (version === itemVersion && deletion.causedByOption === true && body?.variant !== "effect"));
              if (waits)
                await waitForGate(deletion.started, context, TIMINGS.securityDockMax, "narration/earlierDeletion");
            }
            // The server moved on after routing the Option (BeelStarmon trashing it from the
            // sources it just went under), so that waits for the card to get there first.
            const option = optionDockRef.current;
            if (option?.routedAtVersion !== undefined && itemVersion > option.routedAtVersion)
              await waitForGate(option.settled, context, TIMINGS.securityDockMax, "narration/optionSettled");
            if (context.cancelled || narrationSkipRef.current) return;
          }
          if (followsArrival && initialSite?.zone === "field") {
            while (
              queue.hasPendingStep(
                (step) =>
                  noLaterThanClause(step) &&
                  (step.track === `burst-${initialSite.permanentId}` ||
                    step.arrivingPermanentId === initialSite.permanentId),
              ) &&
              context.mode === "live" &&
              !context.cancelled &&
              !context.skipping
            )
              await context.wait(16);
          }
          if (context.mode === "live" && body?.variant === "effect" && costClause) {
            // A ＜Delay＞ pays by trashing its own Option: the Option is lit where it stands,
            // it breaks, and only then is the clause read — the card it plays waits for that.
            activation = {
              key: ++effectSourceKeyRef.current,
              cardId: body.cardId,
              seat,
              site: { zone: "field", permanentId: costClause.permanentId },
              itemId: item.id,
            };
            setEffectSources((sources) => [...sources, activation as EffectActivation]);
            reportShown(`effect-source-${activation.key}`, context);
            await context.wait(effectSourceHoldMs);
            costClause.focused.release();
            await waitForGate(costClause.departing, context, TIMINGS.costClauseDeparture, "narration/costDeparting");
            const departure = costClause.deletion;
            if (costClause.departing.open && departure)
              await waitForGate(departure.shattered, context, TIMINGS.securityDockMax, "narration/costShattered");
            if (context.cancelled || narrationSkipRef.current) return;
          } else if (context.mode === "live" && body?.variant === "effect") {
            // Let this batch register its deletion beats before locating the source.
            await Promise.resolve();
            await waitForEarlierBeats(earlierDrawFlights, context);
            earlierDrawGate?.release();
            if (context.cancelled || narrationSkipRef.current) return;
            for (const deleted of item.notice?.afterDeletions ?? []) {
              const burst = deletionReadyAtRef.current.get(`${deleted.seat}:${deleted.cardId}`);
              await waitForGate(burst?.started, context, TIMINGS.securityDockMax, "narration/causingDeletion");
            }
            await waitForGate(
              precedingDeletion?.started,
              context,
              TIMINGS.securityDockMax,
              "narration/precedingDeletion",
            );
            // A granted clause resolves on its recipient before that recipient is deleted.
            // Waiting for its own shatter would cycle with the deletion waiting for this toast.
            // Under sequential pacing the same holds for any effect its card's deletion does not
            // answer: that deletion is the effect's own result (an <Execute>), waiting on it.
            const deletionIsCause = reactsToDeletion || /on.?deletion/i.test(body.timing ?? "");
            // So does any clause whose card a later batch deleted: BeelStarmon's [When
            // Attacking] reads before the security check that deletes it.
            const ownDeletion = deletionReadyAtRef.current.get(`${seat}:${body.cardId}`);
            const deletedLater =
              ownDeletion?.stateVersion !== undefined &&
              itemVersion !== undefined &&
              ownDeletion.stateVersion > itemVersion;
            // A failed prevention may lose its source later in this same server batch.
            // Its announcement must precede that deletion, even at the same state version.
            const shatter =
              body.beforeRemoval === true ||
              deletedLater ||
              (body.description?.startsWith("[Granted]") && !/delet|destroy/i.test(body.triggerTiming ?? "")) ||
              (unit && !deletionIsCause)
                ? undefined
                : ownDeletion;
            if (shatter) {
              await waitForGate(shatter.shattered, context, TIMINGS.securityDockMax, "narration/shattered");
              await context.wait(Math.max(0, shatter.readyAt - Date.now()));
            }
            if (context.cancelled || narrationSkipRef.current) return;
            const deletion = /on.?deletion/i.test(body.timing ?? "")
              ? deletionReadyAtRef.current.get(`${seat}:${body.cardId}`)
              : undefined;
            const site = deletion?.instanceId
              ? { zone: "trash" as const, instanceId: deletion.instanceId }
              : sourceIndex
                ? initialSite
                : cardSiteRef.current.locate(body.cardId, seat, body);
            if (site && context.mode === "live" && body.isContinuation !== true) {
              activation = {
                key: ++effectSourceKeyRef.current,
                cardId: body.cardId,
                seat,
                site,
                itemId: item.id,
                ...(site.zone === "trash" || site.zone === "hand"
                  ? { motionScale: EFFECT_SPEED_SCALE[getEffectSpeed()] }
                  : {}),
              };
              setEffectSources((sources) => [...sources, activation as EffectActivation]);
              reportShown(`effect-source-${activation.key}`, context);
              // The punch this card earns on its own, ahead of the clause it raised.
              await context.wait(
                effectActivationPreparationMs(
                  site,
                  unit ? sequentialSourceHoldMs(effectSourceHoldMs, unit) : effectSourceHoldMs,
                  activation.motionScale,
                ),
              );
              if (site.zone === "trash")
                await waitForTrashSourceClock(
                  activation.key,
                  TIMINGS.effectTrashPreparation * (activation.motionScale ?? 1),
                  context,
                );
              if (site.zone === "hand")
                await waitForHandSourceClock(
                  activation.key,
                  TIMINGS.effectHandPreparation * (activation.motionScale ?? 1),
                  context,
                );
            }
          }
          if (context.cancelled || narrationSkipRef.current) return;
          const shown = item;
          /* Paced effects show one active clause at a time. A clause no unit owns (a resumed
             effect's later choices, "activate 1 effect below") takes the screen the same way. */
          const takesTheScreen = (published: NarrationItem) =>
            unit !== undefined ||
            (presentationPacingRef.current === "sequential" && published.notice?.body.variant === "effect");
          const publishClause = (published: NarrationItem) => {
            const continuation = published.notice?.body;
            if (continuation?.variant === "effect" && continuation.isContinuation === true) {
              setNarration((items) => {
                const previous = [...items.values()].reverse().find((candidate) => {
                  const existing = candidate.notice?.body;
                  return (
                    candidate.side === published.side &&
                    existing?.variant === "effect" &&
                    existing.cardId === continuation.cardId &&
                    (continuation.timing === undefined || existing.timing === continuation.timing) &&
                    (continuation.effectKey === undefined || existing.effectKey === continuation.effectKey) &&
                    (continuation.sourceInstanceId === undefined ||
                      existing.sourceInstanceId === continuation.sourceInstanceId) &&
                    (continuation.sourcePermanentId === undefined ||
                      existing.sourcePermanentId === continuation.sourcePermanentId)
                  );
                });
                if (previous?.notice?.body.variant !== "effect") {
                  return items;
                }
                const updated = new Map(items);
                updated.set(previous.id, {
                  ...previous,
                  notice: {
                    ...previous.notice,
                    body: { ...previous.notice.body, effectTextPart: continuation.effectTextPart },
                  },
                });
                return updated;
              });
              return true;
            }
            // A clause with an earlier draw, cost, or other result must still explain
            // that result before a later target question in the same effect.
            const question = targetDecisionRef.current;
            if (
              question &&
              waitsForTargets(published.notice, question, viewerSeat) &&
              !hasEarlierClauseResults(published, question, batchesRef.current)
            ) {
              effectSequence.deferClause(published.notice!);
              targetClausesRef.current.set(published.id, () => {
                if (publishClause(published)) {
                  if (activation) {
                    const source = { ...activation, linked: true };
                    setEffectSources((sources) => [...sources.filter((active) => active.key !== source.key), source]);
                  }
                  reportShown(`narration-step-${item.id}`, context);
                }
              });
              return false;
            }
            targetClausesRef.current.delete(published.id);
            const now = Date.now();
            const collapseNarration = collapseNarrationRef.current;
            const fresh = presentableNarration(groupDiscardedSources(published), { collapseNarration });
            setNarration((items) => {
              const current = items;
              const existing = current.get(published.id);
              // Adding the cards half keeps the clock already earned by this occurrence.
              const visible = existing ? { ...fresh, createdAt: existing.createdAt } : fresh;
              return pushNarrationItem(
                takesTheScreen(published)
                  ? supersedeEffectClauses(current, now, activePacing().clauseStackMs)
                  : current,
                visible,
                collapseNarrationRef.current ? NARRATION_QUEUE_LIMIT : narrationLimitRef.current,
                collapseNarrationRef.current,
              );
            });
            effectSequence.showClause(published.notice);
            return true;
          };
          // Left, then right. A moment carrying both halves is a sentence and its result, so
          // the clause takes the screen first and the cards it moved follow a beat later.
          // The folded phone slot draws both halves in one item, so it is published whole.
          const takesColumnSlot = shown.notice !== undefined && !isCardListNotice(shown.notice);
          if (body?.variant !== "effect" || body.isContinuation !== true) {
            if (unit || (takesColumnSlot && effectSequence.pendingCount() > 0)) {
              // A full column pushes its oldest clause out: not before that clause could be read.
              const { clauseReadableMs, clauseStackMs } = activePacing();
              const columnLimit = clauseStackMs > 0 ? narrationLimitRef.current : 1;
              const floorWaitMs =
                clauseReadableMs > 0
                  ? effectSequence.readableFloorWaitMs(Date.now(), columnLimit, clauseReadableMs)
                  : 0;
              if (floorWaitMs > 0) await context.wait(floorWaitMs);
              if (context.cancelled || narrationSkipRef.current) return;
              effectSequence.noteClauseShown(Date.now(), body?.variant === "effect" ? body.cardId : undefined);
            }
          }
          const staggered = !collapseNarrationRef.current && shown.notice !== undefined && shown.panel !== undefined;
          if (staggered) {
            const { panel: _panel, ...clauseOnly } = shown;
            publishClause(clauseOnly);
            await context.wait(TIMINGS.narrationCardsLag);
            if (context.cancelled || narrationSkipRef.current) return;
          }
          const published = publishClause(shown);
          if (itemVersion !== undefined) releaseTrashArrivalsThrough(itemVersion);
          if (activation && published) {
            const key = activation.key;
            linked = true;
            setEffectSources((sources) =>
              sources.map((source) => (source.key === key ? { ...source, linked: true } : source)),
            );
          }
          if (!unit) announceGate?.release();
          if (!unit) costClause?.read.release();
          if (published) reportShown(`narration-step-${item.id}`, context);
          if (unit && !(body?.variant === "effect" && body.isContinuation === true)) {
            // Sequential pacing: nothing the effect did plays until its clause has been read.
            const confirmation = published ? awaitEffectConfirmation(context) : undefined;
            await (confirmation ?? context.wait(announceMsFor(unit)));
            announceGate?.release();
            unitAnnouncement?.release();
            costClause?.read.release();
          }
          // A narration column is a FIFO, not a latest-event ticker. Where the column holds a
          // single moment, give every clause one readable beat before the next server event
          // can replace it. The phone's folded band also shows only the newest moment,
          // even though its accordion retains several items for inspection.
          if (
            shown.notice &&
            !(body?.variant === "effect" && body.isContinuation === true) &&
            (narrationLimitRef.current === 1 || collapseNarrationRef.current)
          )
            await context.wait(TIMINGS.effectAnnounce);
        }
      },
    });
    if (announceGate) void queue.idle().then(() => announceGate.release());
  }

  /** Only newly raised clauses wait; an earlier occurrence is never removed for a question. */
  function flushTargetClauses() {
    for (const publish of [...targetClausesRef.current.values()]) publish();
  }

  /** A later clause waits for draws that were already in flight when it was raised. */
  async function waitForEarlierBeats(earlierDrawFlights: ReadonlySet<string>, context: AnimationStepContext) {
    const deadline = Date.now() + QUEUED_GATE_MAX_MS;
    while (
      queue.hasPendingStep((step) => earlierDrawFlights.has(step.id)) &&
      Date.now() < deadline &&
      !context.cancelled &&
      !context.skipping
    )
      await context.wait(16);
  }

  /**
   * Queues one moment's worth of narration: the panels and the notices the same beat
   * raised, folded into as few items as they honestly make (../../narration).
   */
  function narrate(
    notices: readonly MatchNotice[],
    panels: readonly SidePanel[],
    batchId: string,
    effectSourceHoldMs: number = TIMINGS.effectSourceHold,
    opts?: NarrationPlacement,
  ) {
    if (notices.length === 0 && panels.length === 0) return;
    const items = buildNarrationItems({
      batchId,
      notices,
      panels,
      nowMs: Date.now(),
      nextId: () => `narration-${(narrationSequenceRef.current += 1)}`,
    });
    for (const item of items) enqueueNarrationItem(item, effectSourceHoldMs, opts);
  }

  /** Raises whatever a security check has still not said, on the clock it is raised at. */
  function flushHeldNotices() {
    openHeld(heldNoticesRef.current, heldPanelsRef.current);
  }

  /**
   * Raises exactly these, on the clock they are raised at, and takes them out of the held
   * buckets. Targeted rather than draining: a check is presented in several cues — the dock,
   * the arrival of a card it played, what that card then did — and each cue must say its own
   * part only. Draining let the dock read out an [On Play] result that had not happened on
   * screen yet, because a later batch had parked it in the same bucket.
   */
  function openHeld(heldNotices: readonly MatchNotice[], heldPanels: readonly SidePanel[], opts?: NarrationPlacement) {
    // A held item can be promised to two cues: the late cue a batch enqueued for it while a
    // reveal was on stage, and the reveal's own close, which reserves everything still held.
    // Whichever runs first reads it; the other must not read it again.
    const ownNotices = heldNotices.filter((notice) => !readOutHeldRef.current.has(notice));
    const ownPanels = heldPanels.filter((panel) => !readOutHeldRef.current.has(panel));
    if (ownNotices.length === 0 && ownPanels.length === 0) return;
    for (const item of [...ownNotices, ...ownPanels]) readOutHeldRef.current.add(item);
    heldNoticesRef.current = heldNoticesRef.current.filter((held) => !ownNotices.includes(held));
    heldPanelsRef.current = heldPanelsRef.current.filter((held) => !ownPanels.includes(held));
    const origins = new Set(
      [...ownNotices, ...ownPanels].map((item) => heldOriginsRef.current.get(item)?.batchId ?? lastBatchIdRef.current),
    );
    for (const batchId of origins) {
      narrate(
        ownNotices.filter((item) => (heldOriginsRef.current.get(item)?.batchId ?? lastBatchIdRef.current) === batchId),
        ownPanels.filter((item) => (heldOriginsRef.current.get(item)?.batchId ?? lastBatchIdRef.current) === batchId),
        batchId,
        TIMINGS.effectSourceHold,
        opts,
      );
    }
  }

  /**
   * The clauses a ribbon at `phaseOrder` would cover: everything an earlier phase raised.
   *
   * The ribbon waits one readable beat for them, but it no longer takes them off the
   * screen: a clause keeps its own six-second clock across the turn change, so a moment
   * raised at the end of a turn is still readable once the ribbons are done.
   */
  function narrationBefore(phaseOrder: number): NarrationItem[] {
    return [...narrationRef.current.values()].filter(
      (item) => (narrationPhaseOrdersRef.current.get(item.id) ?? 0) < phaseOrder,
    );
  }

  return {
    enqueueNarrationItem,
    flushTargetClauses,
    narrate,
    flushHeldNotices,
    openHeld,
    narrationBefore,
  };
}
