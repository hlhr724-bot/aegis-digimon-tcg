/* When the viewer's prompt may open, and what guarantees it ever does.

   Three clocks and two releases, in the order they run:

   - The board catches up on its own after `PRESENTED_BOARD_BUDGET_MS`, whatever the queue
     did or failed to do with the steps it is counting.
   - The barrier holds the prompt until the presentation has reached the revision the
     question was asked at, bounded by `PLAY_LEAD_IN_BUDGET_MS`.
   - The stall watchdog is the backstop for a beat that starts and never finishes.

   Each budget exists because the thing it bounds has no clock of its own, and a prompt that
   never opens is a match that ends without ending: the server is blocked on that answer.

   Under sequential pacing every budget grows with the effect units still to play, up to a
   hard ceiling (`sequentialBudgetMs`): a chain of six effects is several seconds of healthy
   presentation, and a clock sized for one moment would cut it short. With no unit pending
   the budgets are exactly the base ones. */

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { AnimationQueue } from "../../animationQueue";
import { type PresentationProgress, PRESENTED_BOARD_BUDGET_MS } from "../../presentationProgress";
import { presentationTelemetry } from "../../presentationTelemetry";
import { DECISION_STALL_BUDGET_MS, PLAY_LEAD_IN_BUDGET_MS } from "../../timings";
import { CueTrack } from "../enums";
import { sequentialBudgetMs } from "../effectSequence";

export function useDecisionBarrier({
  pendingEffectUnits,
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
}: {
  /** Effect units sequential pacing has still to play; always 0 under `current`. */
  pendingEffectUnits: () => number;
  decisionPending: boolean;
  /** The revision the viewer's open decision was raised at. */
  decisionStateVersion: number | undefined;
  decisionAnimationsPending: boolean;
  decisionStalled: boolean;
  decisionBarrier: number | null;
  presentedStateVersion: number | undefined;
  /** The check whose reveal the screen still owes the viewer, by clash key. */
  pendingRevealKey: number | null;
  /** Bumped by every queue change; the heartbeat the stall watchdog waits on. */
  queueActivity: number;
  queue: AnimationQueue;
  progress: PresentationProgress;
  flushHeldNotices: () => void;
  /** Mutated: the battle hold is handed over, the question having taken the board back. */
  securityHoldRef: MutableRefObject<{ key: number; closed: boolean; handedOver?: boolean } | null>;
  /** Lets go of the check's battle beat: the question it paused for outranks it. */
  handOverSecurityBlow: (key: number) => void;
  setDecisionBarrier: Dispatch<SetStateAction<number | null>>;
  setDecisionStalled: Dispatch<SetStateAction<boolean>>;
  setPendingRevealKey: Dispatch<SetStateAction<number | null>>;
}) {
  useEffect(() => {
    if (presentedStateVersion === undefined) return;
    const timer = setTimeout(
      () => {
        if (queue.isPaused()) return;
        presentationTelemetry.countBoardBudgetHit();
        progress.settle();
      },
      sequentialBudgetMs(PRESENTED_BOARD_BUDGET_MS, pendingEffectUnits()),
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentedStateVersion, queueActivity, progress]);

  /**
   * Snapshot revision barrier. Its budget bounds how long the displayed board
   * can lag behind the server; it does not open the decision dialog.
   * `decisionAnimationsPending` independently waits for actual finite queue
   * completion, including consequences in older batches.
   */
  useEffect(() => {
    if (!decisionPending || decisionStateVersion === undefined) {
      setDecisionBarrier(null);
      return;
    }
    // Nothing is being presented, or what is being presented is already newer than the
    // board the question is about: there is nothing to wait for.
    const reached = progress.current();
    if (reached === undefined || reached > decisionStateVersion) {
      progress.raiseFloor(decisionStateVersion);
      setDecisionBarrier(null);
      return;
    }
    setDecisionBarrier(decisionStateVersion);
    // A newer server revision is not proof that the viewer has seen the older
    // consequences. Keep their animations intact while bounding snapshot lag.
    const timer = setTimeout(
      () => {
        if (queue.isPaused()) return;
        // The budget is spent: the board is handed over at the revision the question was
        // asked at, whatever the queue still had to say about the batches before it.
        presentationTelemetry.countDecisionBudgetHit();
        progress.raiseFloor(decisionStateVersion);
        setDecisionBarrier(null);
      },
      sequentialBudgetMs(PLAY_LEAD_IN_BUDGET_MS, pendingEffectUnits()),
    );
    return () => clearTimeout(timer);
    // Finishing a cue is progress: a healthy sequence of phase ribbons, arrivals and
    // deletions must not spend a one-moment budget merely because the server sent it
    // in a burst. A frozen cue still reaches this ceiling without a heartbeat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionPending, decisionStateVersion, queueActivity, progress]);

  /**
   * The wait is on progress: any queue change restarts the clock, so a long healthy sequence
   * runs in full. Only a queue that has not moved for {@link DECISION_STALL_BUDGET_MS} is
   * stalled, and then the prompt is handed over. A fast-forward goes with it, to release
   * whatever skippable waits are still holding the frozen beat.
   */
  useEffect(() => {
    if (!decisionPending || !decisionAnimationsPending) {
      setDecisionStalled(false);
      return;
    }
    if (decisionStalled) return;
    const timer = setTimeout(
      () => {
        if (queue.isPaused()) return;
        presentationTelemetry.countDecisionStallHit();
        queue.skip();
        setDecisionStalled(true);
      },
      sequentialBudgetMs(DECISION_STALL_BUDGET_MS, pendingEffectUnits()),
    );
    return () => clearTimeout(timer);
    // `queueActivity` is the heartbeat this effect waits on, not a value it reads.
  }, [decisionPending, decisionAnimationsPending, decisionStalled, queueActivity, queue]);

  // The barrier's own release: the queue has reached the revision the question was asked
  // at (or run dry), so the prompt may open over that board and never over an older one.
  useEffect(() => {
    if (decisionBarrier === null) return;
    // Caught up: the queue has run dry, or it has moved past the board the question is
    // about. Either way the prompt may open, and never over an older board than this.
    if (presentedStateVersion !== undefined && presentedStateVersion <= decisionBarrier) return;
    progress.raiseFloor(decisionBarrier);
    setDecisionBarrier(null);
  }, [decisionBarrier, presentedStateVersion, progress]);

  // A check the server has not closed yet keeps the board: its card is on stage and what it
  // did is still being read out. The server can stop in the middle of one to ask the viewer
  // something — the revealed card's own [Security] effect, or a reaction the removal armed,
  // which activates between the removal and the battle — and that question cannot wait for a
  // close that only arrives once it is answered. So the question itself hands the board back,
  // and it queues behind the check's own beats: the card is on screen and its clause has been
  // read out before the prompt for it opens.
  useEffect(() => {
    if (!decisionPending || pendingRevealKey === null) return;
    const key = pendingRevealKey;
    queue.enqueue({
      id: `security-decision-${key}`,
      track: CueTrack.CenterStage,
      skippable: false,
      run() {
        flushHeldNotices();
        // The blow this check armed is waited on by every deletion it caused, and each of
        // those beats holds the prompt back. The server is blocked on the answer, so the
        // outcome that would land the blow cannot arrive until the viewer has given it:
        // the question takes the board, and the blow goes with it.
        handOverSecurityBlow(key);
        const held = securityHoldRef.current;
        if (held?.key === key && !held.closed) held.handedOver = true;
        setPendingRevealKey((current) => (current === key ? null : current));
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionPending, pendingRevealKey, queue]);
}
