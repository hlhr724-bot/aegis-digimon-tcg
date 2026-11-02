import type { Dispatch, SetStateAction } from "react";
import { CueTrack, SecurityBreakPhase } from "../enums";
import type { SecurityBreakCue } from "../types";
import { SECURITY_BREAK_TIMINGS, type SecurityBreakScene } from "../../securityClash";
import { TIMINGS } from "../../timings";
import type { AnimationQueue, AnimationStep } from "../../animationQueue";
import { CONSEQUENCE_GATE_MAX_MS, waitForGate, type PresentationGate } from "../presentationGate";

/**
 * The beat before the reveal: the defender's shield arms, its glass shatters, and the
 * board holds while the shards clear. Pure motion — the clash that follows carries the
 * information — so it is skipped outright unless the queue is live.
 */
export function shieldBreakStep({
  queue,
  setSecurityBreak,
  setSecurityHitSeat,
  scene,
  replace = true,
  clausesThrough,
  afterClauses,
  causingEffectGate,
}: {
  queue: AnimationQueue;
  setSecurityBreak: Dispatch<SetStateAction<SecurityBreakCue | null>>;
  setSecurityHitSeat: Dispatch<SetStateAction<number | null>>;
  scene: SecurityBreakScene;
  replace?: boolean;
  /**
   * The state version of the check's batch. Clauses queued from it or earlier batches read
   * first; the check's own clauses are held for the dock and queue only after the break.
   */
  clausesThrough?: number;
  /** Runs once those clauses have been read, before the shield breaks. */
  afterClauses?: () => void;
  /** Effect clause whose announcement must precede this effect-caused shield break. */
  causingEffectGate?: PresentationGate | null;
}): AnimationStep {
  return {
    id: `security-break-${scene.key}`,
    track: CueTrack.CenterStage,
    // The check owns the centre of the screen from here, so whatever was being
    // announced there gives way at the break rather than during the reveal. Only the
    // FIRST break of a run takes the track: a destruction that spends several cards
    // breaks the same shield once per card, and each of those would otherwise cancel
    // the card before it.
    replace,
    async run(context) {
      if (context.mode !== "live") {
        afterClauses?.();
        return;
      }
      await waitForGate(causingEffectGate, context, CONSEQUENCE_GATE_MAX_MS, "securityDestruction/causingEffect");
      if (context.cancelled) return;
      // Raid can redirect an attack into a field battle and Piercing can then continue that
      // same attack into security. These scenes use independent tracks, so keep the shield
      // behind the field clash rather than drawing both combats at once.
      while (!context.cancelled && queue.hasPendingStep((step) => step.id.startsWith("field-clash-")))
        await context.wait(16);
      if (context.cancelled) return;
      // Whatever the attack itself raised reads before the shield breaks. The server
      // resolves a [When Attacking] effect ahead of the reveal, but its toast glows the
      // source card first, so without this wait the check opened over a clause that had
      // not arrived yet and looked like it had fired afterwards.
      // Only batches up to the check's count, so the set is finite. A chain of clauses
      // (BeelStarmon's unsuspend, then the Option it trashed) outlasts one lead, so each clause
      // that finishes buys the next its own lead; a stalled clause still lets the check go.
      if (clausesThrough !== undefined) {
        // A docked Option those clauses are waiting on is part of the same earlier beat.
        const earlierClauses = () =>
          queue.countPendingSteps(
            (step) =>
              (step.id.startsWith("narration-step-") || step.id.startsWith("option-dock-hold-")) &&
              step.origin !== undefined &&
              step.origin.stateVersion <= clausesThrough,
          );
        let remaining = earlierClauses();
        const clausesWereQueued = remaining > 0;
        let deadline = Date.now() + TIMINGS.securityClauseLead;
        while (!context.cancelled && !context.skipping && remaining > 0 && Date.now() < deadline) {
          await context.wait(16);
          const now = earlierClauses();
          if (now < remaining) deadline = Date.now() + TIMINGS.securityClauseLead;
          remaining = now;
        }
        if (context.cancelled) return;
        // The last clause has only just appeared; it gets its read before the shield breaks.
        if (clausesWereQueued) await context.wait(TIMINGS.effectAnnounce);
        if (context.cancelled) return;
      }
      afterClauses?.();
      try {
        setSecurityBreak({ ...scene, phase: SecurityBreakPhase.Arm });
        await context.wait(SECURITY_BREAK_TIMINGS.armMs);
        if (context.cancelled) return;
        setSecurityBreak({ ...scene, phase: SecurityBreakPhase.Break });
        setSecurityHitSeat(scene.seat);
        await context.wait(SECURITY_BREAK_TIMINGS.breakMs + SECURITY_BREAK_TIMINGS.holdMs);
      } finally {
        // A replacing cue cancels the wait; the shield must not be left mid-break.
        setSecurityBreak((current) => (current?.key === scene.key ? null : current));
        setSecurityHitSeat((seat) => (seat === scene.seat ? null : seat));
      }
    },
  };
}
