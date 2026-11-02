import type { MutableRefObject } from "react";
import type { ServerEvent } from "@aegis/shared";
import type { AnimationStep } from "../../animationQueue";
import type { MatchNotice } from "../../notices";
import type { SidePanel } from "../../sidePanels";
import { SHOWCASE_TOTAL_MS, TIMINGS } from "../../timings";
import { CueTrack } from "../enums";
import { fieldDeparturesFromEvent } from "../../showcases";
import type { NarrationPlacement } from "../narration/narrationStream";
import type { RevealOnStage } from "../types";
import { waitForGate, CONSEQUENCE_GATE_MAX_MS, type PresentationGate } from "../presentationGate";

/** Where one batch's notices and panels go, and what the cues ahead of them cost. */
export type NoticeRouting = {
  /** Notices a security reveal reads out beside the card, as soon as it is on screen. */
  heldNotices: readonly MatchNotice[];
  heldPanels: readonly SidePanel[];
  /** What the card the check PLAYED went on to do; it waits for that card to be seen. */
  afterArrivalNotices: readonly MatchNotice[];
  afterArrivalPanels: readonly SidePanel[];
  /** The arrival cues the reveal holds back, so the check can take the screen first. */
  deferredZoneChanges: readonly AnimationStep[];
  /**
   * How long the beats that explain an announced play own the screen before anything that
   * play caused may be narrated: the card held centre-stage under its call-out, then the
   * clause it triggered. A battle's `combatLeadInMs` is the same idea one step earlier in the
   * chain, and the two stack.
   */
  playLeadInMs: number;
};

/**
 * Which beat this batch's notices and panels wait for.
 *
 * Only one of these can be true of a batch, and the order of the branches is the order of
 * precedence: a check the batch opens owns its own timeline, a check still on stage from an
 * earlier batch owns this one, an announced arrival takes the showcase, a battle takes the
 * blow, and anything left simply reads now.
 */
export function routeBatchNotices({
  fresh,
  batchId,
  raised,
  opened,
  noticeAt,
  panelAt,
  presenting,
  arriving,
  showcased,
  showcasePlays,
  afterShowcaseNotices,
  firstArrivalIndex,
  zoneChanges,
  combatLeadInMs,
  combatCompletionGate,
  securityReveal,
  revealOnStageRef,
  noticeSequenceRef,
  showcaseKeyRef,
  heldNoticesRef,
  heldPanelsRef,
  narrate,
  openHeld,
  enqueue,
}: {
  fresh: readonly ServerEvent[];
  batchId: string;
  raised: readonly MatchNotice[];
  opened: readonly SidePanel[];
  noticeAt: readonly number[];
  panelAt: readonly number[];
  presenting: boolean;
  arriving: boolean;
  showcased: boolean;
  showcasePlays: boolean;
  afterShowcaseNotices: readonly MatchNotice[];
  firstArrivalIndex: number;
  zoneChanges: readonly AnimationStep[];
  combatLeadInMs: number;
  combatCompletionGate?: PresentationGate;
  securityReveal: ServerEvent | undefined;
  revealOnStageRef: MutableRefObject<RevealOnStage | null>;
  /** Mutated: incremented per notice id handed out. */
  noticeSequenceRef: MutableRefObject<number>;
  showcaseKeyRef: MutableRefObject<number>;
  /** Mutated: what a check still on stage owes the screen once it is done with it. */
  heldNoticesRef: MutableRefObject<readonly MatchNotice[]>;
  heldPanelsRef: MutableRefObject<readonly SidePanel[]>;
  narrate: (
    notices: readonly MatchNotice[],
    panels: readonly SidePanel[],
    batchId: string,
    effectSourceHoldMs?: number,
    placement?: NarrationPlacement,
  ) => void;
  openHeld: (notices: readonly MatchNotice[], panels: readonly SidePanel[], placement?: NarrationPlacement) => void;
  enqueue: (step: AnimationStep) => void;
}): NoticeRouting {
  const routed: NoticeRouting = {
    heldNotices: [],
    heldPanels: [],
    afterArrivalNotices: [],
    afterArrivalPanels: [],
    deferredZoneChanges: [],
    playLeadInMs: 0,
  };
  if (securityReveal) {
    const beforeCheck =
      securityReveal.kind === "securityRevealed" ? Math.min(fresh.indexOf(securityReveal), firstArrivalIndex) : 0;
    narrate(
      raised.filter((_, index) => noticeAt[index]! < beforeCheck),
      opened.filter((_, index) => panelAt[index]! < beforeCheck),
      batchId,
    );
    // Split at the play. What the revealed card itself did — its `[Security]` clause — reads
    // beside it as soon as it is on screen; what the card it PLAYED went on to do waits for
    // that card to be seen arriving on the field.
    const heldFromCheck = (eventIndex: number) => eventIndex >= beforeCheck && eventIndex < firstArrivalIndex;
    return {
      deferredZoneChanges: zoneChanges,
      heldNotices: raised.filter((_, index) => heldFromCheck(noticeAt[index]!)),
      heldPanels: opened.filter((_, index) => heldFromCheck(panelAt[index]!)),
      afterArrivalNotices: raised.filter((_, index) => noticeAt[index]! >= firstArrivalIndex),
      afterArrivalPanels: opened.filter((_, index) => panelAt[index]! >= firstArrivalIndex),
      playLeadInMs: 0,
    };
  }
  if (revealOnStageRef.current !== null && presenting) {
    // A reveal from an earlier batch is still holding the centre of the screen, either
    // mid-clash or parked in its dock. These are that check's consequences, so they queue
    // behind the reveal on its own track rather than talking over it — behind the dock's
    // arrival, and behind the card-enter cue this same batch enqueued above.
    noticeSequenceRef.current += 1;
    const id = `security-notices-late-${noticeSequenceRef.current}`;
    heldNoticesRef.current = [...heldNoticesRef.current, ...raised];
    heldPanelsRef.current = [...heldPanelsRef.current, ...opened];
    const lateNotices = raised;
    const latePanels = opened;
    enqueue({
      id,
      track: CueTrack.CenterStage,
      skippable: false,
      run() {
        openHeld(lateNotices, latePanels, { next: true });
      },
    });
    return routed;
  }
  if (arriving && presenting) {
    const heldForShowcase = showcased ? afterShowcaseNotices : raised;
    const panelsForShowcase = opened;
    const deletesFromField = fresh.some((event) => fieldDeparturesFromEvent(event).length > 0);
    // The clause the played card triggered gets the beat after the showcase to itself: it is
    // read out, and only then does what it did reach the board. A deletion keeps the final
    // 200 ms of the source glow under the toast, then breaks immediately.
    const clauseRead = heldForShowcase.some((notice) => notice.body.variant === "effect");
    const effectSourceHoldMs = deletesFromField
      ? TIMINGS.effectSourceHold - TIMINGS.noticeIn
      : TIMINGS.effectSourceHold;
    // A security check that replaces the centre-stage track cuts the showcase short, but the
    // clause still has to be read: its effect unit and the deletions it caused wait on it.
    let narrated = false;
    const narrateHeld = () => {
      if (narrated) return;
      narrated = true;
      narrate(heldForShowcase, panelsForShowcase, batchId, effectSourceHoldMs, { next: true });
    };
    enqueue({
      id: `showcase-notices-${showcaseKeyRef.current}`,
      track: CueTrack.CenterStage,
      skippable: false,
      onDiscard: narrateHeld,
      run: narrateHeld,
    });
    // The prompt this play is about to raise waits behind the same beats through the decision
    // barrier, which holds it until the presentation has reached the board the question is
    // about instead of counting a wall clock (Phase 3).
    return {
      ...routed,
      playLeadInMs: showcasePlays
        ? (showcased ? SHOWCASE_TOTAL_MS : 0) +
          (clauseRead ? (deletesFromField ? TIMINGS.effectSourceHold : TIMINGS.effectAnnounce) : 0)
        : 0,
    };
  }
  if ((combatLeadInMs > 0 || combatCompletionGate !== undefined) && presenting) {
    // These read as what the battle caused, so they are raised once the blow has landed.
    // Their clock starts there too, not at the batch that carried them.
    noticeSequenceRef.current += 1;
    const id = `combat-notices-${noticeSequenceRef.current}`;
    const held = raised;
    const heldForCombat = opened;
    enqueue({
      id,
      track: "combatNotices",
      // The wait belongs to the battle, so a skip — or a screen with no animation to watch —
      // collapses it and the notices read at once.
      async run(context) {
        await context.wait(combatLeadInMs);
        await waitForGate(combatCompletionGate, context, CONSEQUENCE_GATE_MAX_MS, "combatNotices/paintedImpact");
        if (context.cancelled) return;
        // Raised once the blow lands, which may be after later effects queued their clauses:
        // jumping all of them would hold an earlier effect's results behind a later one's.
        narrate(held, heldForCombat, batchId, undefined, { inBatchOrder: true });
      },
    });
    return routed;
  }
  narrate(raised, opened, batchId);
  return routed;
}
