/* How far the presentation has got, in server revisions (docs/presentation-queue-plan.md 3.2).

   The board is rendered from the snapshot of the batch the queue is presenting, so the
   queue has to be able to say which batch that is. Steps are counted rather than timed: a
   batch is being presented while any step enqueued for it is still queued or running, and
   the batch being presented is the oldest such batch — the tracks run side by side, so a
   later batch's flight can already be in the air while an earlier batch's item is read.

   Nothing here decides anything about the game; it is bookkeeping over the queue. */

import type { AnimationStep } from "./animationQueue";
import type { PresentationTelemetry } from "./presentationTelemetry";
import { TIMINGS } from "./timings";

/**
 * How long the board may stay behind the live state before it catches up regardless.
 *
 * The count is the only thing that knows a step is over, and a step whose track is
 * replaced before it ever starts never runs — so without a bound a dropped cue could leave
 * the board frozen. One reading time plus a beat: long enough for the moment being read
 * out, short enough that nothing the viewer sees is ever stale for long. Derived from the
 * notice's reading time: a budget shorter than it would cut a notice off mid-read and drop
 * whatever the queue still owed behind it.
 */
export const PRESENTED_BOARD_BUDGET_MS = TIMINGS.noticeLifetime + 800;

interface Entry {
  id: string;
  stateVersion: number;
  outstanding: number;
}

export interface PresentationProgress {
  /** Steps enqueued from here on belong to this batch, whose board is at `stateVersion`. */
  present(batchId: string, stateVersion: number): void;
  /**
   * Count one step into the batch currently being presented. Returns the step with its
   * `run` wrapped; a step enqueued outside any batch is returned untouched.
   */
  track(step: AnimationStep): AnimationStep;
  /**
   * Report at least this revision from now on. The decision barrier sets it once it has
   * caught up (or spent its budget): the viewer must never answer over an older board.
   */
  raiseFloor(stateVersion: number): void;
  hold(stateVersion: number): () => void;
  /** Nothing is running: the presentation is caught up with the live state. */
  settle(): void;
  /** The revision to render, or undefined when the live state is what to render. */
  current(): number | undefined;
}

/** `telemetry`, when given, is told about every batch and every step counted here. */
export function createPresentationProgress(
  onChange: () => void,
  telemetry?: PresentationTelemetry,
): PresentationProgress {
  let entries: Entry[] = [];
  let presenting: Entry | undefined;
  let floor = -1;
  const holds = new Set<{ stateVersion: number }>();

  function reported(): number | undefined {
    const oldest = entries.find((entry) => entry.outstanding > 0);
    const versions = [...holds].map((held) => held.stateVersion);
    if (oldest) versions.push(oldest.stateVersion);
    if (versions.length === 0) return undefined;
    // A prompt's floor raises the narrated snapshot; it does not make later unresolved
    // effects visible. Undefined selects the complete live board, beyond that floor.
    return Math.max(Math.min(...versions), floor);
  }

  function publish(before: number | undefined) {
    // Entries ahead of the oldest unfinished one are history no snapshot is needed for.
    const oldestIndex = entries.findIndex((entry) => entry.outstanding > 0);
    if (oldestIndex > 0) entries = entries.slice(oldestIndex);
    if (reported() !== before) onChange();
  }

  return {
    present(batchId, stateVersion) {
      const before = reported();
      telemetry?.present(batchId, stateVersion);
      presenting = { id: batchId, stateVersion, outstanding: 0 };
      entries = [...entries, presenting];
      publish(before);
    },
    track(step) {
      const entry = presenting;
      if (!entry) return step;
      const before = reported();
      telemetry?.countStep();
      entry.outstanding += 1;
      publish(before);
      let counted = false;
      const release = () => {
        if (counted) return;
        counted = true;
        const previous = reported();
        entry.outstanding -= 1;
        publish(previous);
      };
      return {
        ...step,
        async run(context) {
          try {
            await step.run(context);
          } finally {
            release();
          }
        },
      };
    },
    raiseFloor(stateVersion) {
      if (stateVersion <= floor) return;
      const before = reported();
      floor = stateVersion;
      publish(before);
    },
    hold(stateVersion) {
      const before = reported();
      const held = { stateVersion };
      holds.add(held);
      publish(before);
      return () => {
        if (!holds.has(held)) return;
        const previous = reported();
        holds.delete(held);
        publish(previous);
      };
    },
    settle() {
      // A step whose track was replaced before it ever started runs no `finally`, so its
      // count would hold the board back for the rest of the match. An idle queue is the
      // proof that nothing is left to present, whatever became of the steps.
      const before = reported();
      telemetry?.settle();
      entries = [];
      presenting = undefined;
      holds.clear();
      if (before !== undefined) onChange();
    },
    current: reported,
  };
}
