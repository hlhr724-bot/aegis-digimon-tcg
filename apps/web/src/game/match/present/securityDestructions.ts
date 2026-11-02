import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Seat, ServerEvent } from "@aegis/shared";
import type { AnimationQueue, AnimationStep } from "../../animationQueue";
import type { SidePanelLookup } from "../../sidePanels";
import {
  buildSecurityBreakScene,
  buildSecurityDestructionScene,
  securityDestructionsFromEvents,
  SECURITY_DESTROY_OUTCOME_AT_MS,
  SECURITY_DESTROY_TOTAL_MS,
  type SecurityClashScene,
} from "../../securityClash";
import { waitForCardShatterClock } from "../../cardShatterClock";
import { CueTrack } from "../enums";
import { shieldBreakStep } from "../steps/shieldBreakStep";
import type { SecurityBreakCue } from "../types";
import type { PresentationGate } from "../presentationGate";

/**
 * Every card an effect took out of a security stack, broken one at a time.
 *
 * Such a card is not checked, so nothing else narrates it — the stack simply got shorter. The
 * reference client plays the whole per-card sequence instead (shield break, the card revealed
 * centre-stage, then the card broken where it stands), once for EVERY card, so a Ragnarok
 * Cannon emptying a stack is seen card by card rather than as a counter dropping by four.
 */
export function enqueueSecurityDestructions({
  fresh,
  viewerSeat,
  replayingHistory,
  queue,
  sidePanelLookupRef,
  securityClashKeyRef,
  pendingDestructionsRef,
  setSecurityBreak,
  setSecurityHitSeat,
  setSecurityClash,
  setPendingRevealKey,
  securityCountOf,
  holdSecurityCard,
  releaseSecurityCard,
  releaseSecurityCardWhenIdle,
  releaseSecurityPresentation,
  causingEffectGate,
  enqueue,
}: {
  fresh: readonly ServerEvent[];
  viewerSeat: Seat;
  replayingHistory: boolean;
  queue: AnimationQueue;
  sidePanelLookupRef: MutableRefObject<SidePanelLookup>;
  /** Mutated: incremented per card so each destruction gets its own scene key. */
  securityClashKeyRef: MutableRefObject<number>;
  /** Mutated: how many destruction scenes are still queued or running. */
  pendingDestructionsRef: MutableRefObject<number>;
  setSecurityBreak: Dispatch<SetStateAction<SecurityBreakCue | null>>;
  setSecurityHitSeat: Dispatch<SetStateAction<number | null>>;
  setSecurityClash: Dispatch<SetStateAction<SecurityClashScene | null>>;
  setPendingRevealKey: Dispatch<SetStateAction<number | null>>;
  securityCountOf: (seat: Seat) => number | undefined;
  holdSecurityCard: (key: number, seat: Seat, count: number | undefined) => void;
  releaseSecurityCard: (key: number) => void;
  releaseSecurityCardWhenIdle: (key: number) => void;
  releaseSecurityPresentation: (key: number) => void;
  /** The triggered effect that caused the security loss must be announced first. */
  causingEffectGate: PresentationGate | null;
  enqueue: (step: AnimationStep) => void;
}) {
  const destructions = securityDestructionsFromEvents(fresh, sidePanelLookupRef.current);
  // Read once, before any of the scenes: it is the figure that still counts every card the
  // run is about to spend, and each card puts one back as its own scene breaks it.
  const securityBeforeDestruction = new Map<Seat, number | undefined>(
    destructions.map((destruction) => [destruction.seat, securityCountOf(destruction.seat)]),
  );
  const spentPerSeat = new Map<Seat, number>();
  destructions.forEach((destruction, index) => {
    securityClashKeyRef.current += 1;
    const key = securityClashKeyRef.current;
    const spent = spentPerSeat.get(destruction.seat) ?? 0;
    spentPerSeat.set(destruction.seat, spent + 1);
    const before = securityBeforeDestruction.get(destruction.seat);
    holdSecurityCard(key, destruction.seat, before === undefined ? undefined : before - spent);
    const scene = buildSecurityDestructionScene({
      key,
      cardId: destruction.cardId,
      artId: destruction.artId,
      trashedSeat: destruction.seat,
      viewerSeat,
    });
    // An arriving card must land before its effects destroy security. The first shield
    // break may retire an older security scene, but cannot replace that arrival.
    // The rest queue
    // behind their predecessor on the same track — including a predecessor from an EARLIER
    // batch: a chained effect delivers one trash per batch, and replacing would cancel the
    // previous card's scene mid-play.
    enqueue(
      shieldBreakStep({
        queue,
        setSecurityBreak,
        setSecurityHitSeat,
        scene: buildSecurityBreakScene({ key, defenderSeat: destruction.seat, viewerSeat }),
        replace:
          index === 0 &&
          pendingDestructionsRef.current === 0 &&
          !queue.hasPendingStep(
            (step) =>
              step.track === CueTrack.CenterStage &&
              (step.id.startsWith("zone-change-") ||
                step.id.startsWith("security-clash-outcome-") ||
                step.id.startsWith("security-presented-") ||
                step.id.startsWith("security-notices-late-")),
          ),
        causingEffectGate,
      }),
    );
    pendingDestructionsRef.current += 1;
    enqueue({
      id: `security-destroyed-${key}`,
      track: CueTrack.CenterStage,
      // Which card the stack just lost is information, not decoration: it keeps its time even
      // under reduced motion or on a hidden tab.
      skippable: false,
      async run(context) {
        try {
          setSecurityClash({ ...scene, lightOwner: { context, enqueue } });
          // The stack loses this card as it breaks, so the shield drops one at that beat
          // rather than all of them at once when the effect resolved.
          await context.wait(SECURITY_DESTROY_OUTCOME_AT_MS);
          releaseSecurityCard(key);
          await context.wait(SECURITY_DESTROY_TOTAL_MS - SECURITY_DESTROY_OUTCOME_AT_MS);
          await waitForCardShatterClock(key, context);
        } finally {
          pendingDestructionsRef.current = Math.max(0, pendingDestructionsRef.current - 1);
          releaseSecurityCard(key);
          setSecurityClash((current) => (current?.key === key ? null : current));
        }
      },
    });
    releaseSecurityCardWhenIdle(key);
  });
  if (destructions.length === 0) return;
  // A destruction step dropped from the queue before it ever ran (a newer check replacing the
  // track) never reaches its `finally`, so the count is squared with reality at the latest
  // when nothing is running — same discipline as the held shield figures.
  void queue.idle().then(() => {
    pendingDestructionsRef.current = 0;
  });
  // The trashed cards own the centre of the screen exactly as a reveal does, so a question the
  // same batch carries — the order of the triggers the effect fired, say — waits behind the
  // last card's scene. Opened at once, its dialog covered the very cards the effect just spent.
  const lastKey = securityClashKeyRef.current;
  if (!replayingHistory) setPendingRevealKey(lastKey);
  releaseSecurityPresentation(lastKey);
}
