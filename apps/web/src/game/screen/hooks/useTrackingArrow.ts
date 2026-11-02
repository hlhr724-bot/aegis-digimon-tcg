import { useLayoutEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import type { DecisionRequest, GameState, Seat, ServerEvent } from "@aegis/shared";
import { clipToBox, type ArrowBox } from "../../arrowGeometry";
import {
  createAttackArrowTracker,
  effectTargetArrow,
  type ArrowEndpoint,
  type TrackingArrow,
} from "../../trackingArrow";
import type { FieldClashScene } from "../../fieldClash";
import type { SecurityClashScene } from "../../securityClash";
import { readAttackArrowClock, type AttackArrowClock } from "../../attackArrowClock";
import { DragKind } from "../enums";
import { permanentVisualElement } from "../dropZones";
import type { TrackingArrowGeometry } from "../types";

/**
 * The live target arrow.
 *
 * What it points at is protocol truth — the declared attack still open, or the targets the
 * viewer has picked for the effect currently asking. Where those cards *are* changes
 * constantly (a card suspends, the board reflows, the hand grows), so the endpoints are
 * re-solved every frame while the arrow is up rather than measured once at declaration.
 *
 * A battle that declares and resolves in one batch never has an open attack in the log, so
 * the clash scene keeps its own arrow up while it plays.
 */
export function useTrackingArrow({
  state,
  events,
  decision,
  picks,
  viewerSeat,
  fieldClash,
  securityClash,
  phasePresentationPending = false,
  effectSelection,
  boardRef,
  permRefs,
  permCentersRef,
  viewerSecurityRef,
  opponentSecurityRef,
}: {
  state: GameState | undefined;
  events: readonly ServerEvent[];
  decision: DecisionRequest | undefined;
  picks: readonly string[];
  viewerSeat: Seat;
  fieldClash: FieldClashScene | null;
  securityClash?: SecurityClashScene | null;
  /** Raw attack publication can precede the phase that introduces its action. */
  phasePresentationPending?: boolean;
  effectSelection?: { sourcePermanentId: string; targetPermanentIds: readonly string[] };
  boardRef: RefObject<HTMLDivElement | null>;
  permRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  /** Where each permanent last stood, so a deleted card's arrow still reaches it. */
  permCentersRef: MutableRefObject<Record<string, { x: number; y: number }>>;
  viewerSecurityRef: RefObject<HTMLDivElement | null>;
  opponentSecurityRef: RefObject<HTMLDivElement | null>;
}): TrackingArrowGeometry | null {
  const attackerCardIds = new Map(
    [...(state?.players ?? [])].flatMap((player) =>
      [...player.battleArea, ...(player.breeding ? [player.breeding] : [])].flatMap((permanent) =>
        permanent.topCard?.cardId ? [[permanent.topCard.cardId, permanent.permanentId] as const] : [],
      ),
    ),
  );
  const fieldClashArrow: TrackingArrow | null = fieldClash
    ? {
        kind: DragKind.Attack,
        key: fieldClash.arrowKey ?? `clash:${fieldClash.key}`,
        from: { kind: "permanent", permanentId: fieldClash.attacker.permanentId },
        to: [{ kind: "permanent", permanentId: fieldClash.defender.permanentId }],
      }
    : null;
  const attackTracker = useRef<ReturnType<typeof createAttackArrowTracker> | null>(null);
  if (!attackTracker.current) attackTracker.current = createAttackArrowTracker();
  const openAttackArrow = attackTracker.current.read(events);
  const trackingArrowRequest =
    effectTargetArrow({
      decision,
      picks,
      viewerSeat,
      sourcePermanentId:
        decision?.sourcePermanentId ??
        (decision?.sourceCardId ? attackerCardIds.get(decision.sourceCardId) : undefined),
    }) ??
    (effectSelection
      ? {
          kind: "effect" as const,
          key: `effect:${effectSelection.sourcePermanentId}`,
          from: { kind: "permanent" as const, permanentId: effectSelection.sourcePermanentId },
          to: effectSelection.targetPermanentIds.map((permanentId) => ({ kind: "permanent" as const, permanentId })),
        }
      : null) ??
    fieldClashArrow ??
    (securityClash && !securityClash.departing && !securityClash.exiting ? securityClash.attackArrow : null) ??
    (phasePresentationPending ? null : openAttackArrow);

  const [trackingArrow, setTrackingArrow] = useState<TrackingArrowGeometry | null>(null);
  const trackingArrowRef = useRef<TrackingArrow | null>(null);
  trackingArrowRef.current = trackingArrowRequest;
  const arrowClockRef = useRef(fieldClash?.arrowClock);
  arrowClockRef.current = fieldClash?.arrowClock;
  const paintedArrowRef = useRef<{ key: string; permanentId: string } | null>(null);
  const retainedClockRef = useRef<AttackArrowClock | undefined>(undefined);
  const lastPermanentBoxesRef = useRef(new Map<string, ArrowBox>());
  const trackingArrowActive = trackingArrowRequest !== null;
  const requestIdentity = JSON.stringify(trackingArrowRequest);
  useLayoutEffect(() => {
    if (!trackingArrowActive) {
      setTrackingArrow(null);
      return;
    }
    let frame = 0;
    let applied = "";
    const endpoint = (end: ArrowEndpoint, board: DOMRect): ArrowBox | undefined => {
      const element =
        end.kind === "permanent"
          ? permRefs.current[end.permanentId]
          : end.seat === viewerSeat
            ? viewerSecurityRef.current
            : opponentSecurityRef.current;
      // A permanent deleted by the battle has left the board, but the arrow must still reach
      // where it stood, so its last measurement stands in.
      if (!element?.isConnected) {
        return end.kind === "permanent"
          ? (lastPermanentBoxesRef.current.get(end.permanentId) ?? permCentersRef.current[end.permanentId])
          : undefined;
      }
      const rect = (end.kind === "permanent" ? permanentVisualElement(element) : element).getBoundingClientRect();
      if (!rect.width) return undefined;
      const box: ArrowBox = {
        x: rect.left + rect.width / 2 - board.left,
        y: rect.top + rect.height / 2 - board.top,
        halfWidth: rect.width / 2,
        halfHeight: rect.height / 2,
      };
      // Keep the same live bounds after removal, including the edge the beam stops at.
      if (end.kind === "permanent") lastPermanentBoxesRef.current.set(end.permanentId, box);
      return box;
    };
    const solve = () => {
      frame = window.requestAnimationFrame(solve);
      const request = trackingArrowRef.current;
      const board = boardRef.current;
      // Security disposal temporarily removes the arrow between checks. Capture its
      // native clock while it is painted so the same declaration cannot sweep again.
      const painted = paintedArrowRef.current;
      const retained = retainedClockRef.current;
      if (painted && (retained?.key !== painted.key || retained.remainingMs > 0)) {
        const clock = readAttackArrowClock({ board, ...painted });
        if (clock) retainedClockRef.current = clock;
      }
      if (!request || !board) return;
      // A confirmed attack shows its arrow after the card has finished suspending.
      // Read the actual rotation: attacks without a tap and reduced motion need no delay.
      // A redirect keeps the painted key and follows its target while that card moves.
      if (request.key.startsWith("attack:") && !applied.startsWith(`${request.key}|`)) {
        const attacker = permRefs.current[request.from.permanentId];
        const rotating =
          attacker &&
          permanentVisualElement(attacker)
            .getAnimations?.()
            .some(
              (animation) =>
                "transitionProperty" in animation &&
                animation.transitionProperty === "rotate" &&
                animation.playState !== "finished" &&
                animation.playState !== "idle",
            );
        if (rotating) {
          if (applied !== "") {
            applied = "";
            setTrackingArrow(null);
          }
          return;
        }
      }
      const boardRect = board.getBoundingClientRect();
      const fromBox = endpoint(request.from, boardRect);
      const targetEntries = request.to.flatMap((end) => {
        const box = endpoint(end, boardRect);
        return box ? [{ box, end }] : [];
      });
      const toBoxes = targetEntries.map((entry) => entry.box);
      const firstTarget = toBoxes[0];
      if (!fromBox || !firstTarget) {
        if (applied !== "") {
          applied = "";
          setTrackingArrow(null);
        }
        return;
      }
      // The tail leaves the attacker towards its first target; every beam stops short of the
      // box it points at so the card under attack stays readable.
      const from = clipToBox(fromBox, firstTarget);
      const to = toBoxes.map((box) => clipToBox(box, fromBox));
      const signature = `${request.key}|${Math.round(from.x)},${Math.round(from.y)}|${to
        .map((point) => `${Math.round(point.x)},${Math.round(point.y)}`)
        .join(";")}`;
      if (signature === applied) return;
      applied = signature;
      // A temporary effect-selection beam must not replace the attack's clock.
      if (request.kind === "attack")
        paintedArrowRef.current = { key: request.key, permanentId: request.from.permanentId };
      setTrackingArrow({
        key: request.key,
        kind: request.kind,
        from,
        to,
        sourcePermanentId: request.from.permanentId,
        targetKeys: targetEntries.map(({ end }) =>
          end.kind === "permanent" ? end.permanentId : end.seat === viewerSeat ? "security-you" : "security-opp",
        ),
        clock:
          arrowClockRef.current ??
          (retainedClockRef.current?.key === request.key ? retainedClockRef.current : undefined),
      });
    };
    solve();
    return () => window.cancelAnimationFrame(frame);
  }, [trackingArrowActive, viewerSeat, requestIdentity]);
  return trackingArrow;
}
