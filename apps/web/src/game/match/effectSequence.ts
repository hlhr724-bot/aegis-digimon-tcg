/* Sequential pacing: one triggered effect is one unit, and units play strictly in turn.

   The server resolves a whole chain in a few milliseconds, but it closes each effect's
   announcement, its consequences and its resolution in batches of their own. Under the
   `current` pacing those batches are presented side by side, so the fourth effect's draw can
   fly while the first effect's clause is still being read. Under `sequential` pacing every
   effect gets three beats of its own, in server order:

   - announce: its source card lights up and its clause is the only clause on screen;
   - results:  everything its batches did plays, once the clause has been read for
               `announceMs`;
   - settle:   the board rests for `settleMs` before the next effect lights up.

   An effect that asks the viewer something (an optional "Use?") is announced before the
   prompt opens and resolved after it closes. What the answer did then gets a second announce
   beat, so it does not play the instant the prompt disappears.

   Every duration comes from `activePacing()` (../pacing), read when the beat starts. A minor
   effect, one that only changes memory or DP, reads and rests for the shorter `minor*` beats.

   A unit opens at `effectTriggered` and closes at the matching `effectResolved`; the
   batches in between are its consequences. The same effect firing again right after it
   resolved (three copies of one card reacting to one event) joins that unit instead of
   opening a new one, as long as the unit has not started: it is announced once, "×N", and
   plays every copy's results in its results beat. Two steps per unit on one serial track enforce
   the order: the first holds the board while the unit is announced, the second waits out
   the unit's results and the settle beat.

   Nothing here decides anything about the game; it is bookkeeping over the batches the
   server already closed. */

import type { Seat, ServerEvent } from "@aegis/shared";
import type { AnimationQueue, AnimationStep } from "../animationQueue";
import { activePacing } from "../pacing";
import { TIMINGS } from "../timings";
import { CueTrack } from "./enums";
import { isFieldDelay } from "./present/costClause";
import { createPresentationGate, waitForGate, type PresentationGate } from "./presentationGate";

export const EFFECT_UNIT_TRACK = "effectUnit";

const RESULTS_POLL_MS = 16;

const TURN_TRACKS: ReadonlySet<string> = new Set(["phaseBanner", "unsuspendSweep"]);

/**
 * A lag budget stretched by the units still waiting to play, so a long chain is not cut short
 * by a clock sized for one moment. With nothing pending it is the base budget unchanged.
 */
export function sequentialBudgetMs(baseMs: number, pendingUnits: number, pacing = activePacing()): number {
  if (pendingUnits <= 0) return baseMs;
  return Math.min(pacing.budgetCeilingMs, Math.max(baseMs, baseMs + pendingUnits * pacing.unitBudgetMs));
}

/** What a minor effect may report: a memory change, or a DP modifier that protection absorbed. */
const MINOR_RESULT_KINDS: ReadonlySet<ServerEvent["kind"]> = new Set([
  "memoryChanged",
  "dpModifierApplied",
  "batchClosed",
  "effectActivated",
]);

/**
 * A minor effect gets the short `minor*` beats. The server has closed it, and every event it
 * carried is a memory change or bookkeeping: no card moved, was deleted or was revealed, and
 * nobody was asked anything. An ordinary DP change reaches the client only as state, with no
 * event, so a closed effect with no events at all is minor too. The events cannot tell that
 * DP change from other state-only results (a suspension, a granted keyword); those take the
 * short beats as well. An effect still open is never minor: what it will do is unknown.
 */
export function isMinorEffect(unit: Pick<EffectUnit, "closed" | "resultKinds">): boolean {
  if (!unit.closed) return false;
  for (const kind of unit.resultKinds) if (!MINOR_RESULT_KINDS.has(kind)) return false;
  return true;
}

type BeatFacts = Pick<EffectUnit, "closed" | "resultKinds"> & Partial<Pick<EffectUnit, "chainIndex" | "repeat">>;

export interface UnitBeats {
  sourceHoldMs: number;
  announceMs: number;
  settleMs: number;
  /** The beat after the viewer's answer, before what it did plays. */
  resumeMs: number;
}

/**
 * The beats one effect gets. A minor effect, and an opponent's effect repeating card text the
 * chain already showed, take the short beats. Late effects shorten clause and settle beats
 * at `chainTailPercent`, preserving the time to find their physical source. Their clauses
 * stay readable after their beats in the recent stack.
 */
export function unitBeats(unit: BeatFacts, pacing = activePacing()): UnitBeats {
  const minor = isMinorEffect(unit);
  const short = minor || (pacing.repeatShortBeats > 0 && unit.repeat === true);
  const tail =
    pacing.chainTailFrom > 0 && (unit.chainIndex ?? 0) > pacing.chainTailFrom ? pacing.chainTailPercent / 100 : 1;
  const scaled = (ms: number) => Math.round(ms * tail);
  return {
    sourceHoldMs: short ? pacing.shortSourceHoldMs : pacing.sourceHoldMs,
    announceMs: scaled(short ? pacing.minorAnnounceMs : pacing.announceMs),
    settleMs: scaled(short ? pacing.minorSettleMs : pacing.settleMs),
    resumeMs: scaled(minor ? pacing.minorAnnounceMs : pacing.resumeAnnounceMs),
  };
}

export function announceMsFor(unit: BeatFacts, pacing = activePacing()): number {
  return unitBeats(unit, pacing).announceMs;
}

export function settleMsFor(unit: BeatFacts, pacing = activePacing()): number {
  return unitBeats(unit, pacing).settleMs;
}

/**
 * The source glow under sequential pacing. The caller's hold is `effectSourceHold` minus any
 * trim it applies (a deletion shortens it), and the trim is kept.
 */
export function sequentialSourceHoldMs(currentHoldMs: number, unit?: BeatFacts, pacing = activePacing()): number {
  const hold = unit ? unitBeats(unit, pacing).sourceHoldMs : pacing.sourceHoldMs;
  return Math.max(0, currentHoldMs - TIMINGS.effectSourceHold + hold);
}

/** Server fields that name a card, a card instance or a permanent. */
const CARD_REFERENCE_KEY = /(?:instanceId|permanentId|cardId)s?$/i;

/** Every card, instance and permanent an event names, one level into its lists and records. */
function cardReferences(event: ServerEvent): string[] {
  const found: string[] = [];
  const visit = (value: unknown, key: string, depth: number) => {
    if (typeof value === "string") {
      if (CARD_REFERENCE_KEY.test(key)) found.push(value);
    } else if (Array.isArray(value)) {
      for (const entry of value) visit(entry, key, depth);
    } else if (value !== null && typeof value === "object" && depth < 2) {
      for (const [childKey, child] of Object.entries(value)) visit(child, childKey, depth + 1);
    }
  };
  visit(event, "", 0);
  return found;
}

/**
 * Two paced effects in a row belong to one chain unless the screen went quiet in between
 * for this long with nothing asked. A question the viewer answers slowly does not end it.
 */
const CHAIN_BREAK_MS = 2000;

export interface EffectUnit {
  id: number;
  seat: Seat;
  sourceCardId: string;
  effectKey: string;
  sourceInstanceId?: string;
  timing?: string;
  description: string;
  /** Every batch the unit spans: its announcement, its consequences, its resolution. */
  batchIds: Set<string>;
  /** Batches whose visual consequences wait for this unit to announce. */
  resultBatchIds: Set<string>;
  /** The kinds of every event the unit carried between its announcement and its resolution. */
  resultKinds: Set<ServerEvent["kind"]>;
  /** Its `effectResolved` has been presented. */
  closed: boolean;
  /** How many identical triggers this unit stands for. */
  count: number;
  /** The unit's own effect asked the viewer something while it was open: the answer resumes it. */
  askedDuring: boolean;
  sourcePermanentId?: string;
  /** Its place in the chain being presented, from 1. */
  chainIndex: number;
  /** An opponent's effect whose card and text already resolved earlier in this chain. */
  repeat: boolean;
  /** Cards, instances and permanents its results named. */
  touched: Set<string>;
  /**
   * Steps its closing batch queued for what came after its close (the battle after a
   * [When Attacking] clause). They are not its results, so its settle does not wait for them.
   */
  stepsAfterClose: Set<string>;

  /** A clause was raised for it. A unit nobody announces has nothing to read before its results. */
  narrated: boolean;
  /** Opens when its clause is visible; hiding it behind an own-card dialog resets this gate. */
  clauseVisible: PresentationGate;
  /** The unit ahead of this one has settled: its source may light up. */
  started: PresentationGate;
  /** Its clause has been on screen for its announce beat: its results may play. Replaced when the unit resumes. */
  announced: PresentationGate;
  /** Its results and its settle beat are over. Replaced when the unit resumes. */
  settled: PresentationGate;
}

/** What one presented batch means for the units. */
export interface ObservedBatch {
  /** The units this batch opened, with the index of the `effectTriggered` that opened each. */
  opened: readonly { unit: EffectUnit; eventIndex: number }[];
  /** Triggers that joined an earlier unit of the same effect, which announces them all. */
  grouped: readonly { unit: EffectUnit; eventIndex: number }[];
  /** The unit whose announcement this batch's consequences wait on, if any. */
  owner: EffectUnit | undefined;
  /** The unit still open when the batch began: the batch's first events are its results. */
  carriedBy: EffectUnit | undefined;
  /**
   * A unit that had settled to let the viewer answer its question, and whose results this
   * batch brings: it plays again from a fresh announce beat ({@link resumedUnitSteps}).
   */
  resumed?: EffectUnit;
}

export interface EffectSequence {
  observeBatch(batchId: string, stateVersion: number, events: readonly ServerEvent[]): ObservedBatch;
  /** Ties a raised clause to the unit it announces. */
  bindNotice(notice: object, unit: EffectUnit): void;
  unitOf(notice: object | undefined): EffectUnit | undefined;
  /** The clause a unit raised, to restate its count after a trigger joined it. */
  noticeOf(unit: EffectUnit): object | undefined;
  /** A dialog is repeating this clause, so its returning toast is still owed. */
  deferClause(notice: object): void;
  /** The clause is on screen, including an own-card toast returned after its dialog. */
  showClause(notice: object | undefined): void;
  /** Discarded clauses cannot be owed again when their answered effect resumes. */
  skipClauses(): void;
  /** A returned clause, or the same effect's dialog still open, makes its resume readable. */
  resumedClauseReady(unit: EffectUnit, decisionPending: boolean): PresentationGate;
  /**
   * The card whose effect is asking the viewer something, or undefined once nothing is asked.
   * That card's open units wait on the answer, including one whose trigger reaches the client
   * after the question.
   */
  noteQuestion(sourceCardId: string | undefined): void;
  /** A clause step, which no unit's results wait on: it belongs to its own unit's announce. */
  markClauseStep(stepId: string): void;
  isClauseStep(stepId: string): boolean;
  /** Units already closed and still settling whose results this batch carried. */
  closedUnitsIn(batchId: string): EffectUnit[];
  /**
   * The cause of a change the live state shows before the batch that made it has been
   * presented: the state patch reaches the client ahead of its batch's close, and one patch
   * can carry several batches. The change is pinned to the earliest batch still to come,
   * because pinning it to the newest would hold it behind every effect in between. The gate
   * opens once that batch's unit, if it has one, is announced, and its ceiling only starts
   * once that unit has started.
   */
  causeOfLiveChange(liveStateVersion: number): PresentationGate;
  /**
   * The cause of a change a watcher sees across batches already observed: several batches can
   * reach the screen in one frame, and their board with them. The change is pinned to the
   * earliest of them an effect owns, the one the watcher's previous board had not seen yet.
   * A retained snapshot supplies `throughVersion` so a later effect cannot own its change.
   */
  causeOfObservedChange(sinceVersion: number, throughVersion?: number): PresentationGate | undefined;
  /** The newest batch revision observed, so a watcher can tell a change whose batch is still ahead. */
  observedVersion(): number;
  unitAtVersion(stateVersion: number): EffectUnit | undefined;
  /** A batch at this revision was presented, whatever the pacing: the causes it carried are known. */
  noteVersion(stateVersion: number): void;
  /** Units opened and not yet settled. */
  pendingCount(): number;
  /**
   * Opens once every unit opened so far has settled, or null when none is pending. A batch
   * no unit owns (a security check the server ran after the chain) waits on it, so what the
   * server did next does not play over the effects it did first.
   */
  unsettled(): PresentationGate | null;
  settle(unit: EffectUnit): void;
  hasLaterUnit(unit: EffectUnit): boolean;
  /**
   * Whether the effect after `unit` is known and its source is none of the cards `unit`'s
   * results named, so it may light up while those results still play.
   */
  nextSparesResultsOf(unit: EffectUnit): boolean;
  /** A paced clause, or a notice in its column, took the screen. */
  noteClauseShown(atMs: number, sourceCardId?: string): void;
  /**
   * How long a new paced clause must wait so the clause it would push out of a column of
   * `columnLimit` has been on screen for `floorMs`.
   */
  readableFloorWaitMs(nowMs: number, columnLimit: number, floorMs: number): number;
  /**
   * How long the viewer's open decision must wait so the newest clause its rail will hide,
   * every clause but the asking effect's own, has been on screen for `floorMs`.
   */
  promptFloorWaitMs(nowMs: number, floorMs: number): number;
}

export interface EffectSequenceOptions {
  /** The viewer's seat: only another seat's repeated effects take the short beats. */
  viewerSeat?: () => Seat | undefined;
}

/**
 * Whether a new trigger repeats the unit that just resolved: same seat, card and printed
 * effect (its timing and text; the key names one copy's subscription, so it differs per
 * copy), nothing else opened since, and the unit still waiting to be announced. A unit
 * already on screen keeps its count; a question asked in between has let it start by then.
 */
function repeats(
  unit: EffectUnit | undefined,
  event: Extract<ServerEvent, { kind: "effectTriggered" }>,
): unit is EffectUnit {
  return (
    unit !== undefined &&
    unit.closed &&
    !unit.started.open &&
    // Each field Delay cost needs its own physical focus and shatter before its clause.
    // A merged clause cannot hand the second Option's focus gate to its deletion.
    !isFieldDelay(event) &&
    unit.seat === event.seat &&
    unit.sourceCardId === event.sourceCardId &&
    unit.timing === event.timing &&
    unit.description === event.description
  );
}

function sameEffect(unit: EffectUnit, event: Extract<ServerEvent, { kind: "effectResolved" }>): boolean {
  if (unit.seat !== event.seat || unit.effectKey !== event.effectKey) return false;
  return (
    unit.sourceInstanceId === undefined ||
    event.sourceInstanceId === undefined ||
    unit.sourceInstanceId === event.sourceInstanceId
  );
}

export function createEffectSequence(options: EffectSequenceOptions = {}): EffectSequence {
  let newestId = 0;
  let chainLength = 0;
  const chainSeen = new Set<string>();
  let lastSettledAt = Number.NEGATIVE_INFINITY;
  let askedSinceUnit = false;
  const shownClauses: { atMs: number; sourceCardId?: string }[] = [];
  let latestVersion = -1;
  /** The gate the next unit to open starts behind. */
  let tail: PresentationGate | null = null;
  const open: EffectUnit[] = [];
  const pending = new Set<EffectUnit>();
  const notices = new WeakMap<object, EffectUnit>();
  const noticeByUnit = new WeakMap<EffectUnit, object>();
  const resumedClauses = new Map<EffectUnit, PresentationGate>();
  let askingCardId: string | undefined;
  let newestUnit: EffectUnit | undefined;
  const clauseSteps = new Set<string>();
  const causes = new Map<number, { gate: PresentationGate; started: PresentationGate }>();
  const ownerByVersion = new Map<number, EffectUnit>();

  function openUnit(event: Extract<ServerEvent, { kind: "effectTriggered" }>, batchId: string): EffectUnit {
    const started = createPresentationGate();
    const announced = createPresentationGate();
    announced.after = started;
    if (tail) started.after = tail;
    newestId += 1;
    if (pending.size === 0 && !askedSinceUnit && Date.now() - lastSettledAt > CHAIN_BREAK_MS) {
      chainLength = 0;
      chainSeen.clear();
    }
    askedSinceUnit = false;
    chainLength += 1;
    const seenKey = `${event.seat}:${event.sourceCardId}:${event.description}`;
    const repeat = event.seat !== options.viewerSeat?.() && chainSeen.has(seenKey);
    chainSeen.add(seenKey);
    const unit: EffectUnit = {
      id: newestId,
      seat: event.seat,
      sourceCardId: event.sourceCardId,
      effectKey: event.effectKey,
      ...(event.sourceInstanceId !== undefined ? { sourceInstanceId: event.sourceInstanceId } : {}),
      ...(event.timing !== undefined ? { timing: event.timing } : {}),
      description: event.description,
      batchIds: new Set([batchId]),
      resultBatchIds: new Set(),
      resultKinds: new Set(),
      closed: false,
      count: 1,
      askedDuring: askingCardId === event.sourceCardId,
      ...(event.sourcePermanentId !== undefined ? { sourcePermanentId: event.sourcePermanentId } : {}),
      chainIndex: chainLength,
      repeat,
      touched: new Set(),
      stepsAfterClose: new Set(),
      narrated: false,
      clauseVisible: createPresentationGate(),
      started,
      announced,
      settled: createPresentationGate(),
    };
    tail = announced;
    open.push(unit);
    pending.add(unit);
    newestUnit = unit;
    return unit;
  }

  function bindCauses(stateVersion: number, owner: EffectUnit | undefined) {
    for (const [version, cause] of causes) {
      if (version > stateVersion) continue;
      causes.delete(version);
      if (owner) {
        void owner.started.opened.then(() => cause.started.release());
        void owner.announced.opened.then(() => cause.gate.release());
      } else {
        cause.started.release();
        cause.gate.release();
      }
    }
  }

  return {
    observeBatch(batchId, stateVersion, events) {
      latestVersion = Math.max(latestVersion, stateVersion);
      const innermostOpen = open.at(-1);
      const nestedStillPlaying = innermostOpen !== undefined && [...pending].some((unit) => unit.id > innermostOpen.id);
      const carriedBy = nestedStillPlaying ? undefined : innermostOpen;
      const opened: { unit: EffectUnit; eventIndex: number }[] = [];
      const grouped: { unit: EffectUnit; eventIndex: number }[] = [];
      let closed: EffectUnit | undefined;
      for (const [eventIndex, event] of events.entries()) {
        if (event.kind === "effectTriggered") {
          const joined = open.length === 0 && repeats(newestUnit, event) ? newestUnit : undefined;
          if (joined) {
            joined.count += 1;
            joined.closed = false;
            // The unit now waits for this copy's resolution, which names this copy's key.
            joined.effectKey = event.effectKey;
            if (event.sourceInstanceId !== undefined) joined.sourceInstanceId = event.sourceInstanceId;
            else delete joined.sourceInstanceId;
            joined.batchIds.add(batchId);
            open.push(joined);
            grouped.push({ unit: joined, eventIndex });
          } else opened.push({ unit: openUnit(event, batchId), eventIndex });
          continue;
        }
        const carrier = open.at(-1);
        carrier?.batchIds.add(batchId);
        if (event.kind !== "effectResolved") carrier?.resultKinds.add(event.kind);
        if (carrier && event.kind !== "effectResolved" && event.kind !== "batchClosed")
          for (const reference of cardReferences(event)) carrier.touched.add(reference);
        // No effect outlives its turn. One the server never closed must not claim the next turn's batches.
        if (event.kind === "turnEnded") open.length = 0;
        if (event.kind !== "effectResolved") continue;
        const matching = open.filter((unit) => sameEffect(unit, event)).at(-1);
        const [resolved] = matching ? open.splice(open.indexOf(matching), 1) : [];
        if (!resolved) continue;
        resolved.closed = true;
        resolved.batchIds.add(batchId);
        closed = resolved;
      }
      const owner = opened.at(-1)?.unit ?? grouped.at(-1)?.unit ?? carriedBy ?? closed;
      owner?.resultBatchIds.add(batchId);
      const resumed =
        owner !== undefined &&
        owner === carriedBy &&
        owner.id === newestId &&
        owner.askedDuring &&
        !pending.has(owner) &&
        opened.length === 0
          ? owner
          : undefined;
      if (resumed) {
        resumed.askedDuring = false;
        resumed.announced = createPresentationGate();
        resumed.settled = createPresentationGate();
        pending.add(resumed);
      }
      bindCauses(stateVersion, owner);
      if (owner && !ownerByVersion.has(stateVersion)) {
        ownerByVersion.set(stateVersion, owner);
        if (ownerByVersion.size > 200) ownerByVersion.delete(ownerByVersion.keys().next().value!);
      }
      return { opened, grouped, owner, carriedBy, ...(resumed ? { resumed } : {}) };
    },
    bindNotice(notice, unit) {
      notices.set(notice, unit);
      noticeByUnit.set(unit, notice);
      unit.narrated = true;
    },
    unitOf(notice) {
      return notice ? notices.get(notice) : undefined;
    },
    noticeOf(unit) {
      return noticeByUnit.get(unit);
    },
    deferClause(notice) {
      const unit = notices.get(notice);
      if (unit?.clauseVisible.open) unit.clauseVisible = createPresentationGate();
    },
    showClause(notice) {
      if (notice) notices.get(notice)?.clauseVisible.release();
    },
    skipClauses() {
      for (const unit of new Set([...open, ...pending])) unit.clauseVisible.release();
      for (const ready of resumedClauses.values()) ready.release();
    },
    resumedClauseReady(unit, decisionPending) {
      const ready = createPresentationGate();
      if (unit.clauseVisible.open || (decisionPending && askingCardId === unit.sourceCardId)) ready.release();
      else {
        resumedClauses.set(unit, ready);
        void unit.clauseVisible.opened.then(() => ready.release());
      }
      return ready;
    },
    noteQuestion(sourceCardId) {
      askingCardId = sourceCardId;
      if (sourceCardId !== undefined) askedSinceUnit = true;
      for (const unit of open) if (unit.sourceCardId === sourceCardId) unit.askedDuring = true;
      for (const [unit, ready] of resumedClauses) if (unit.sourceCardId === sourceCardId) ready.release();
    },
    markClauseStep(stepId) {
      clauseSteps.add(stepId);
      if (clauseSteps.size > 200) clauseSteps.delete(clauseSteps.values().next().value!);
    },
    isClauseStep(stepId) {
      return clauseSteps.has(stepId);
    },
    closedUnitsIn(batchId) {
      return [...pending].filter((unit) => unit.closed && unit.batchIds.has(batchId));
    },
    causeOfLiveChange(liveStateVersion) {
      const version = Math.min(liveStateVersion, latestVersion + 1);
      const existing = causes.get(version);
      if (existing) return existing.gate;
      const started = createPresentationGate();
      const gate = createPresentationGate();
      gate.after = started;
      causes.set(version, { gate, started });
      return gate;
    },
    causeOfObservedChange(sinceVersion, throughVersion = latestVersion) {
      let earliest: number | undefined;
      for (const version of ownerByVersion.keys())
        if (
          version > sinceVersion &&
          version <= Math.min(throughVersion, latestVersion) &&
          (earliest === undefined || version < earliest)
        )
          earliest = version;
      return earliest === undefined ? undefined : ownerByVersion.get(earliest)!.announced;
    },
    unitAtVersion(stateVersion) {
      return ownerByVersion.get(stateVersion);
    },
    observedVersion() {
      return latestVersion;
    },
    noteVersion(stateVersion) {
      latestVersion = Math.max(latestVersion, stateVersion);
      bindCauses(stateVersion, undefined);
    },
    pendingCount() {
      return pending.size;
    },
    unsettled() {
      let newest: EffectUnit | undefined;
      for (const unit of pending) if (!newest || unit.id > newest.id) newest = unit;
      return newest?.settled ?? null;
    },
    settle(unit) {
      pending.delete(unit);
      resumedClauses.delete(unit);
      // An answer can open the next question before its results finish. Re-arm the
      // same unit so that question's final answer earns its own return beat too.
      if (askingCardId === unit.sourceCardId) unit.askedDuring = true;
      lastSettledAt = Date.now();
      unit.started.release();
      unit.announced.release();
      unit.settled.release();
      if (tail === unit.announced) tail = null;
    },
    hasLaterUnit(unit) {
      return newestId > unit.id;
    },
    noteClauseShown(atMs, sourceCardId) {
      shownClauses.push({ atMs, ...(sourceCardId !== undefined ? { sourceCardId } : {}) });
      if (shownClauses.length > 8) shownClauses.shift();
    },
    readableFloorWaitMs(nowMs, columnLimit, floorMs) {
      const atRisk = shownClauses.at(-Math.max(1, columnLimit));
      return atRisk === undefined ? 0 : Math.max(0, atRisk.atMs + floorMs - nowMs);
    },
    promptFloorWaitMs(nowMs, floorMs) {
      const hidden = [...shownClauses].reverse().find((clause) => clause.sourceCardId !== askingCardId);
      return hidden === undefined ? 0 : Math.max(0, hidden.atMs + floorMs - nowMs);
    },
    nextSparesResultsOf(unit) {
      let next: EffectUnit | undefined;
      for (const candidate of pending)
        if (candidate.id > unit.id && (!next || candidate.id < next.id)) next = candidate;
      if (!next) return false;
      const sources = [next.sourceCardId, next.sourceInstanceId, next.sourcePermanentId];
      return sources.every((source) => source === undefined || !unit.touched.has(source));
    },
  };
}

export interface EffectUnitStepsDeps {
  sequence: EffectSequence;
  queue: Pick<AnimationQueue, "hasPendingStep">;
  /** The server batch a queued step belongs to, however it was enqueued. */
  batchOf: (step: AnimationStep) => string | undefined;
  decisionPending: () => boolean;
  /** The unit's source has lit up: it is the effect on screen now. */
  onStarted?: (unit: EffectUnit) => void;
  onSettled?: (unit: EffectUnit) => void;
}

function resultsPendingOf(unit: EffectUnit, deps: EffectUnitStepsDeps): () => boolean {
  const { sequence, queue, batchOf } = deps;
  // Results wait for the batch owner to announce. Membership alone is not ownership:
  // sequential or nested units may share a batch, and waiting here for a later owner
  // would hold its announcement behind this settle until the ceiling.
  return () =>
    queue.hasPendingStep((step) => {
      if (step.track === EFFECT_UNIT_TRACK || sequence.isClauseStep(step.id)) return false;
      // Audio receipts share a serial track. A nested unit's sound may be waiting for
      // that unit to announce before a later parent receipt can play. Waiting for
      // the latter here would hold the nested announcement behind this settle.
      // Painted results still own the handoff; audio retains its queued order.
      if (step.track === "sound") return false;
      if (unit.stepsAfterClose.has(step.id)) return false;
      if (step.track === CueTrack.SecurityDock || step.track === CueTrack.SecurityHold) return false;
      // An effect-used Option waits in its dock for the viewer's next answer.
      // That decision waits for this unit to settle, so waiting for the hold
      // here would make both wait until the results ceiling expires. The dock's
      // entrance still counts as a result and must finish before the handoff.
      if (step.track === CueTrack.OptionDockHold) return false;
      // A turn or phase ribbon the unit's closing batch also carried is the turn moving on,
      // not a result of the effect.
      if (TURN_TRACKS.has(step.track ?? "") || step.track?.startsWith("turnDrawFlight-")) return false;
      const batchId = batchOf(step);
      return batchId !== undefined && unit.resultBatchIds.has(batchId);
    });
}

/**
 * Waits out the unit's results, rests its settle beat, and hands the track to the next unit.
 * A resumed unit does not wait for its close: the answer's results are already here, and
 * whatever else the server resolves before the close is not what the viewer is watching.
 */
function settleStep(unit: EffectUnit, deps: EffectUnitStepsDeps, id: string, waitForClose = true): AnimationStep {
  const { sequence, decisionPending, onSettled } = deps;
  const resultsPending = resultsPendingOf(unit, deps);
  // The server has not closed the unit yet. It may be waiting on the viewer, or resolving an
  // effect nested inside this one, and neither lets the unit's own close arrive first.
  const awaitingClose = () => waitForClose && !unit.closed && !decisionPending() && !sequence.hasLaterUnit(unit);
  // With `overlapResults`, the next effect may light up while these results play, as long as
  // they leave its source alone: its own results still wait for its clause.
  const overlaps = () => activePacing().overlapResults > 0 && !decisionPending() && sequence.nextSparesResultsOf(unit);
  return {
    id,
    track: EFFECT_UNIT_TRACK,
    holdsBoard: false,
    async run(context) {
      try {
        const live = () => context.mode === "live" && !context.cancelled && !context.skipping;
        const resultsMaxMs = activePacing().resultsMaxMs;
        // Counted in queue time, so a paused or slowed queue does not run the ceiling out.
        for (
          let waited = 0;
          live() && waited < resultsMaxMs && ((resultsPending() && !overlaps()) || awaitingClose());
          waited += RESULTS_POLL_MS
        )
          await context.wait(RESULTS_POLL_MS);
        if (live() && !(resultsPending() && overlaps())) await context.wait(settleMsFor(unit));
        // An open decision rail hides every clause but its own: the one on screen is read first.
        const floorMs = activePacing().clauseReadableMs;
        if (live() && floorMs > 0 && decisionPending()) {
          const floorWaitMs = sequence.promptFloorWaitMs(Date.now(), floorMs);
          if (floorWaitMs > 0) await context.wait(floorWaitMs);
        }
      } finally {
        sequence.settle(unit);
        onSettled?.(unit);
      }
    },
  };
}

/**
 * The two steps that pace one unit, both on {@link EFFECT_UNIT_TRACK} so a unit cannot begin
 * before the one ahead of it has settled.
 *
 * The first holds the board at the batch that announced the unit while its source glows and
 * its clause is read: a later effect's batch must not reach the board first. The second lets
 * the board go, waits for the unit's results to finish, then rests for its settle beat. Both
 * block a decision, so a prompt opens over a settled board rather than mid-effect.
 */
export function effectUnitSteps(unit: EffectUnit, deps: EffectUnitStepsDeps): AnimationStep[] {
  const { onStarted } = deps;
  const announced = unit.announced;
  return [
    {
      id: `effect-unit-announce-${unit.id}`,
      track: EFFECT_UNIT_TRACK,
      holdsBoard: true,
      async run(context) {
        try {
          unit.started.release();
          onStarted?.(unit);
          if (context.mode !== "live" || !unit.narrated) return;
          await waitForGate(announced, context, activePacing().announceMaxMs, "effectUnit/announced");
        } finally {
          announced.release();
        }
      },
    },
    settleStep(unit, deps, `effect-unit-settle-${unit.id}`),
  ];
}

/**
 * The steps that play a unit's results after the viewer answered its question. The unit had
 * settled so the prompt could open. A dialog may have hidden its clause, so the answer's
 * results wait for that clause to return, then take their finite resume beat.
 */
export function resumedUnitSteps(unit: EffectUnit, deps: EffectUnitStepsDeps): AnimationStep[] {
  const announced = unit.announced;
  return [
    {
      id: `effect-unit-resume-${unit.id}`,
      track: EFFECT_UNIT_TRACK,
      holdsBoard: true,
      async run(context) {
        try {
          if (context.mode === "live" && unit.narrated) {
            await waitForGate(
              deps.sequence.resumedClauseReady(unit, deps.decisionPending()),
              context,
              activePacing().announceMaxMs,
              "effectUnit/resumedClause",
            );
            if (!context.cancelled && !context.skipping) await context.wait(unitBeats(unit).resumeMs);
          }
        } finally {
          announced.release();
        }
      },
    },
    settleStep(unit, deps, `effect-unit-resettle-${unit.id}`, false),
  ];
}
