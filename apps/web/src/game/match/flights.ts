import { Zone } from "@aegis/shared/schema/enums";
import type { FlyPublicPileCard } from "@/game/match/present/enqueuePublicPileMoves";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Seat } from "@aegis/shared";
import type { AnimationQueue, AnimationStepContext } from "../animationQueue";
import { Side } from "../side";
import { isTouchLayout } from "./environment";
import { waitForStackStrips } from "./stackStripBarrier";
import { TIMINGS } from "../timings";
import { CueTrack } from "./enums";
import type { DrawBurst, DrawFlight, DrawFlightCard, DrawHandArrival, HeldHandArrival, MatchCueAnchors } from "./types";
import { CONSEQUENCE_GATE_MAX_MS, waitForGate, type PresentationGate } from "./presentationGate";
import { waitForPresentation } from "./cardReveal";
import { drawPresentationTiming, DRAW_PRESENTATION_GEOMETRY } from "../drawPresentationModel";
import { runDrawPresentation } from "./drawPresentationClock";
import { waitForHandArrivalClock } from "./handArrivalClock";
import { waitForDeckReturnClock } from "./deckReturnClock";
import { waitForHandReturnClock } from "./handReturnClock";
import type { FieldShatterFace } from "../fieldShatter";
import { HAND_CARD_WIDTH } from "../piece/constants";
import { waitForPaintedAnimation } from "../paintedAnimationClock";

export interface CueFlightsDeps {
  queue: AnimationQueue;
  anchors: MatchCueAnchors;
  /** Origin of event-driven flights, retained while later batches arrive. */
  presentationBatchRef?: MutableRefObject<{ batchId: string; stateVersion: number } | undefined>;
  viewerSeat: Seat;
  stackStripKeyRef?: MutableRefObject<number>;
  /** The clause a flight is a consequence of, which is read out before the cards move. */
  causingEffectGateRef: MutableRefObject<PresentationGate | null>;
  securityGainKeyRef: MutableRefObject<number>;
  drawFlightKeyRef: MutableRefObject<number>;
  setSecurityFlights: Dispatch<SetStateAction<ReadonlyMap<number, number>>>;
  setSecurityDealCounts: Dispatch<SetStateAction<ReadonlyMap<Seat, number>>>;
  setDrawFlights: Dispatch<SetStateAction<readonly DrawFlight[]>>;
  setDrawBursts: Dispatch<SetStateAction<readonly DrawBurst[]>>;
  setHeldHandArrivals: Dispatch<SetStateAction<ReadonlyMap<number, HeldHandArrival>>>;
}

/** Card presentations and transfers between a deck, a hand and a shield. */
export function cueFlights(deps: CueFlightsDeps) {
  const {
    queue,
    anchors,
    presentationBatchRef,
    viewerSeat,
    stackStripKeyRef,
    causingEffectGateRef,
    securityGainKeyRef,
    drawFlightKeyRef,
    setSecurityFlights,
    setSecurityDealCounts,
    setDrawFlights,
    setDrawBursts,
    setHeldHandArrivals,
  } = deps;

  /** The card lands on the stack: the same shield bounce a recovery plays. */
  function launchSecurityGainFlight(seat: Seat) {
    const key = (securityGainKeyRef.current += 1);
    const causingEffectGate = causingEffectGateRef.current;
    queue.enqueue({
      id: `security-gain-flight-${seat}-${key}`,
      ...(presentationBatchRef?.current ? { origin: { ...presentationBatchRef.current } } : {}),
      track: `securityFlight-${seat}`,
      async run(context) {
        if (context.mode !== "live") return;
        await waitForGate(causingEffectGate, context, CONSEQUENCE_GATE_MAX_MS, "securityGainFlight/causingEffect");
        if (context.cancelled || context.skipping || context.mode !== "live") return;
        try {
          setSecurityFlights((seats) => new Map(seats).set(seat, key));
          await context.wait(TIMINGS.securityFlight);
          await waitForPaintedAnimation(
            () => (seat === viewerSeat ? anchors.yourSecurity.current : anchors.oppSecurity.current),
            "battle-security-flight",
            TIMINGS.securityFlight,
            context,
          );
        } finally {
          setSecurityFlights((seats) => {
            if (seats.get(seat) !== key) return seats;
            const next = new Map(seats);
            next.delete(seat);
            return next;
          });
        }
      },
    });
  }

  /**
   * The opening five cards (Comprehensive Rules §5-2-1-6). The server sets the whole stack
   * in one patch, so the deal is the client's own: one card back flies from the deck to the
   * shield per card, and the shield's figure follows the cards rather than the patch.
   */
  function launchOpeningSecurityDeal(seat: Seat, count: number) {
    setSecurityDealCounts((counts) => new Map(counts).set(seat, 0));
    queue.enqueue({
      id: `security-deal-${seat}`,
      track: `securityDeal-${seat}`,
      replace: true,
      async run(context) {
        try {
          for (let dealt = 0; dealt < count; dealt += 1) {
            if (context.cancelled) return;
            launchDeckToSecurityFlight(seat);
            await context.wait(TIMINGS.securityDealStagger);
            setSecurityDealCounts((counts) => new Map(counts).set(seat, dealt + 1));
          }
          await context.wait(TIMINGS.securityFlight);
        } finally {
          setSecurityDealCounts((counts) => {
            if (!counts.has(seat)) return counts;
            const next = new Map(counts);
            next.delete(seat);
            return next;
          });
        }
      },
    });
  }

  /**
   * Presents a deck draw before its physical hand card and counts advance. Other
   * searches/returns only enter their hand slots after their causal/reveal gates.
   *
   * A `card` supplies the viewer's own artwork or an explicitly public opponent card.
   * A public card waits for its matching reveal; opaque opponent draws show a card back.
   */
  function launchDrawFlight(
    side: Side,
    turnStart = false,
    waitBeforeMs = 0,
    card?: DrawFlightCard,
    arrived?: PresentationGate,
    draw?: DrawHandArrival,
    afterStackStripKey = stackStripKeyRef?.current,
  ) {
    // A turn's own draw is not the consequence of any clause; every other draw is.
    const causingEffectGate = turnStart ? null : causingEffectGateRef.current;
    const board = anchors.board.current;
    const source = side === Side.Viewer ? anchors.yourDeck.current : anchors.oppDeck.current;
    const target = side === Side.Viewer ? anchors.yourHandDock.current : anchors.oppHandStrip.current;
    if (!board || !source || !target) return;
    const boardRect = board.getBoundingClientRect();
    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    // Layout-free environments (jsdom) report zero boxes: no geometry, no flight,
    // and so no step is ever enqueued there.
    if (!sourceRect.width || !targetRect.width) return;
    const from = {
      x: sourceRect.left + sourceRect.width / 2 - boardRect.left,
      y: sourceRect.top + sourceRect.height / 2 - boardRect.top,
    };
    const to = {
      x: targetRect.left + targetRect.width / 2 - boardRect.left,
      y: targetRect.top + targetRect.height / 2 - boardRect.top,
    };
    const key = (drawFlightKeyRef.current += 1);
    if (draw) {
      const timing = draw.entryOnly ? { handoff: 0, total: TIMINGS.handDraw } : drawPresentationTiming(side);
      const handFace = anchors.yourHandDock.current?.querySelector<HTMLElement>("[data-hand-instance-id]");
      const handWidth = handFace
        ? parseFloat(handFace.ownerDocument.defaultView!.getComputedStyle(handFace).width)
        : HAND_CARD_WIDTH;
      const width = (handWidth || HAND_CARD_WIDTH) * 1.1;
      const pile = (source.querySelector(".game-pile") ?? source).getBoundingClientRect();
      const pileX = pile.left + pile.width / 2 - boardRect.left;
      const pileY = pile.top + pile.height / 2 - boardRect.top;
      const inward = pileX >= boardRect.width / 2 ? -1 : 1;
      const presentation: DrawFlight = {
        key,
        x: pileX + inward * width * DRAW_PRESENTATION_GEOMETRY.inwardWidths,
        y: pileY + (side === Side.Viewer ? width * 1.4 * DRAW_PRESENTATION_GEOMETRY.viewerDownHeights : 0),
        dx: 0,
        dy: 0,
        duration: timing.total,
        ...(card ? { card } : {}),
        presentation: { side, width, inward, ...(draw.instanceId ? { instanceId: draw.instanceId } : {}) },
      };
      function release() {
        setHeldHandArrivals((held) => {
          if (!held.has(key)) return held;
          const next = new Map(held);
          next.delete(key);
          return next;
        });
      }
      if (queue.getMode() === "live")
        setHeldHandArrivals((held) =>
          new Map(held).set(key, { ...draw, seat: side === Side.Viewer ? viewerSeat : viewerSeat === 0 ? 1 : 0 }),
        );
      const origin = presentationBatchRef?.current ? { ...presentationBatchRef.current } : undefined;
      queue.enqueue({
        id: `draw-flight-${key}`,
        ...(origin ? { origin } : {}),
        side,
        track:
          draw.publicCard && !arrived && !draw.afterReveal && !draw.beforeEntry
            ? CueTrack.CenterStage
            : `${turnStart ? "turnDrawFlight" : "drawFlight"}-presentation`,
        onDiscard: release,
        async run(context) {
          try {
            await Promise.all([
              waitForGate(causingEffectGate, context, CONSEQUENCE_GATE_MAX_MS, "drawPresentation/causingEffect"),
              waitBeforeMs > 0 ? context.wait(waitBeforeMs) : Promise.resolve(),
            ]);
            if (afterStackStripKey !== undefined)
              await waitForStackStrips({ queue, context, throughKey: afterStackStripKey, side });
            await waitForPresentation(arrived, context);
            await waitForPresentation(draw.afterReveal, context);
            await waitForGate(draw.beforeEntry, context, CONSEQUENCE_GATE_MAX_MS, "handEntry/fieldReturn");
            if (context.cancelled || context.mode !== "live" || context.skipping) return;
            await runDrawPresentation({
              queue,
              context,
              key,
              origin,
              side,
              timing,
              show: () => {
                if (draw.entryOnly) release();
                else setDrawFlights((flights) => [...flights, presentation]);
              },
              ...(draw.entryOnly
                ? {
                    waitForClock: (_key: number, beat: number, local: AnimationStepContext) =>
                      beat > 0
                        ? waitForHandArrivalClock({ side, instanceId: draw.instanceId, context: local })
                        : Promise.resolve(),
                  }
                : {}),
              handOver: release,
              clear: () => {
                release();
                setDrawFlights((flights) => flights.filter((candidate) => candidate.key !== key));
              },
            });
          } finally {
            release();
            setDrawFlights((flights) => flights.filter((candidate) => candidate.key !== key));
          }
        },
      });
      return;
    }
    // The card back is hand-card sized on a phone; at 340ms that size crosses a
    // 393px screen too fast to register, so the touch layouts get a longer trip.
    // The element animates on this same number, set inline by GameScreen, so the
    // unmount below can never cut the flight short.
    const duration = isTouchLayout() ? TIMINGS.drawFlightTouch : TIMINGS.drawFlight;
    const flight: DrawFlight = {
      key,
      x: from.x,
      y: from.y,
      dx: to.x - from.x,
      dy: to.y - from.y,
      duration,
      ...(card ? { card } : {}),
    };
    // Two hands can grow at once, so each card back gets a track of its own rather
    // than queueing behind the other side's.
    queue.enqueue({
      id: `draw-flight-${key}`,
      ...(presentationBatchRef?.current ? { origin: { ...presentationBatchRef.current } } : {}),
      side,
      track: card && !arrived ? CueTrack.CenterStage : `${turnStart ? "turnDrawFlight" : "drawFlight"}-${key}`,
      async run(context) {
        await Promise.all([
          waitForGate(causingEffectGate, context, CONSEQUENCE_GATE_MAX_MS, "drawFlight/causingEffect"),
          waitBeforeMs > 0 ? context.wait(waitBeforeMs) : Promise.resolve(),
        ]);
        // A hand-count fallback can be a bounce resolved in the same patch as source
        // trashing. Its flight must follow the peels, just like the presented hand count.
        if (afterStackStripKey !== undefined) {
          await waitForStackStrips({ queue, context, throughKey: afterStackStripKey, side });
        }
        await waitForPresentation(arrived, context);
        if (context.cancelled) return;
        setDrawFlights((flights) => [...flights, flight]);
        await context.wait(duration);
        setDrawFlights((flights) => flights.filter((candidate) => candidate.key !== key));
        // Only the draw the turn opens with gets the starburst: an effect draw is
        // already narrated by its own notice, and two cues would read as two draws.
        if (!turnStart || context.mode !== "live" || context.cancelled) return;
        setDrawBursts((bursts) => [...bursts, { key, x: to.x, y: to.y }]);
        await context.wait(TIMINGS.drawBurst);
        setDrawBursts((bursts) => bursts.filter((candidate) => candidate.key !== key));
      },
    });
  }

  /** One card back from a seat's deck onto its security shield. */
  function launchDeckToSecurityFlight(seat: Seat) {
    const board = anchors.board.current;
    const source = seat === viewerSeat ? anchors.yourDeck.current : anchors.oppDeck.current;
    const target = seat === viewerSeat ? anchors.yourSecurity.current : anchors.oppSecurity.current;
    if (!board || !source || !target) return;
    const boardRect = board.getBoundingClientRect();
    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    // Layout-free environments (jsdom) report zero boxes: no geometry, no flight.
    if (!sourceRect.width || !targetRect.width) return;
    const x = sourceRect.left + sourceRect.width / 2 - boardRect.left;
    const y = sourceRect.top + sourceRect.height / 2 - boardRect.top;
    const key = (drawFlightKeyRef.current += 1);
    const duration = isTouchLayout() ? TIMINGS.drawFlightTouch : TIMINGS.drawFlight;
    const flight: DrawFlight = {
      key,
      x,
      y,
      dx: targetRect.left + targetRect.width / 2 - boardRect.left - x,
      dy: targetRect.top + targetRect.height / 2 - boardRect.top - y,
      duration,
    };
    // Each card of the deal is its own track: they overlap on purpose, so the stack is
    // built by a run of cards rather than by one card played five times.
    queue.enqueue({
      id: `security-deal-flight-${key}`,
      track: `securityDealFlight-${key}`,
      async run(context) {
        setDrawFlights((flights) => [...flights, flight]);
        await context.wait(duration);
        setDrawFlights((flights) => flights.filter((candidate) => candidate.key !== key));
      },
    });
  }

  function launchDeckToUnderFlight(seat: Seat, permanentId: string) {
    const board = anchors.board.current;
    const source = seat === viewerSeat ? anchors.yourDeck.current : anchors.oppDeck.current;
    const target = anchors.permanentCenter?.(permanentId);
    if (!board || !source || !target) return;
    const boardRect = board.getBoundingClientRect();
    const sourceRect = source.getBoundingClientRect();
    if (!sourceRect.width) return;
    const x = sourceRect.left + sourceRect.width / 2 - boardRect.left;
    const y = sourceRect.top + sourceRect.height / 2 - boardRect.top;
    const key = ++drawFlightKeyRef.current;
    const duration = isTouchLayout() ? TIMINGS.drawFlightTouch : TIMINGS.drawFlight;
    const flight: DrawFlight = { key, x, y, dx: target.x - x, dy: target.y - y, duration };
    const causingEffectGate = causingEffectGateRef.current;
    queue.enqueue({
      id: `deck-under-flight-${key}`,
      ...(presentationBatchRef?.current ? { origin: { ...presentationBatchRef.current } } : {}),
      track: `deckUnder-${permanentId}`,
      async run(context) {
        await waitForGate(causingEffectGate, context, CONSEQUENCE_GATE_MAX_MS, "deckUnderFlight/causingEffect");
        if (context.cancelled) return;
        setDrawFlights((flights) => [...flights, flight]);
        await context.wait(duration);
        setDrawFlights((flights) => flights.filter((candidate) => candidate.key !== key));
      },
    });
  }

  /**
   * A face-up card leaving a board element (a docked Option) for a permanent's digivolution
   * cards. Runs inside the caller's step so whatever follows waits for the landing; false
   * when there is no geometry to fly between.
   */
  async function flyCardUnder(
    card: DrawFlightCard,
    from: Element,
    permanentId: string,
    context: AnimationStepContext,
  ): Promise<boolean> {
    const board = anchors.board.current;
    const target = anchors.permanentCenter?.(permanentId);
    if (!board || !target || context.mode !== "live") return false;
    const boardRect = board.getBoundingClientRect();
    const sourceRect = from.getBoundingClientRect();
    if (!sourceRect.width) return false;
    const x = sourceRect.left + sourceRect.width / 2 - boardRect.left;
    const y = sourceRect.top + sourceRect.height / 2 - boardRect.top;
    const key = ++drawFlightKeyRef.current;
    const duration = isTouchLayout() ? TIMINGS.drawFlightTouch : TIMINGS.drawFlight;
    setDrawFlights((flights) => [...flights, { key, x, y, dx: target.x - x, dy: target.y - y, duration, card }]);
    try {
      await context.wait(duration);
    } finally {
      setDrawFlights((flights) => flights.filter((candidate) => candidate.key !== key));
    }
    return true;
  }

  /**
   * A face-up card leaving the field for its owner's deck, from where it stood. `from` is
   * measured by the caller before it lets go of the card, since the board drops it then.
   * Runs inside the caller's step; false when there is no geometry to fly between.
   */
  async function flyCardToDeck(
    card: DrawFlightCard,
    from: { x: number; y: number; width?: number; height?: number; stackClone?: HTMLElement; permanentId?: string },
    seat: Seat,
    context: AnimationStepContext,
  ): Promise<boolean> {
    const board = anchors.board.current;
    const deck = seat === viewerSeat ? anchors.yourDeck.current : anchors.oppDeck.current;
    if (!board || !deck || context.mode !== "live" || context.cancelled || context.skipping) return false;
    const boardRect = board.getBoundingClientRect();
    const deckRect = deck.getBoundingClientRect();
    if (!deckRect.width) return false;
    const to = {
      x: deckRect.left + deckRect.width / 2 - boardRect.left - board.clientLeft + board.scrollLeft,
      y: deckRect.top + deckRect.height / 2 - boardRect.top - board.clientTop + board.scrollTop,
    };
    const key = ++drawFlightKeyRef.current;
    const duration = TIMINGS.deckReturn;
    setDrawFlights((flights) => [
      ...flights,
      {
        key,
        x: from.x,
        y: from.y,
        dx: to.x - from.x,
        dy: to.y - from.y,
        duration,
        card,
        deckReturn: { ...from, width: from.width ?? 72, height: from.height ?? 100.8, angle: 0 },
      },
    ]);
    try {
      await context.wait(duration);
      await waitForDeckReturnClock(board, key, context);
    } finally {
      setDrawFlights((flights) => flights.filter((candidate) => candidate.key !== key));
    }
    return true;
  }

  async function flyCardToHand(
    card: DrawFlightCard,
    from: FieldShatterFace,
    seat: Seat,
    context: AnimationStepContext,
  ): Promise<boolean> {
    const board = anchors.board.current;
    const hand = seat === viewerSeat ? anchors.yourHandDock.current : anchors.oppHandStrip.current;
    if (!board || !hand || context.mode !== "live" || context.cancelled || context.skipping) return false;
    const boardRect = board.getBoundingClientRect();
    const handRect = hand.getBoundingClientRect();
    if (!handRect.width) return false;
    const x = handRect.left + handRect.width / 2 - boardRect.left - board.clientLeft + board.scrollLeft;
    const y = handRect.top + handRect.height / 2 - boardRect.top - board.clientTop + board.scrollTop;
    const key = ++drawFlightKeyRef.current;
    setDrawFlights((flights) => [
      ...flights,
      {
        key,
        x: from.x,
        y: from.y,
        dx: x - from.x,
        dy: y - from.y,
        duration: TIMINGS.handReturn,
        card,
        handReturn: { ...from, targetScale: seat === viewerSeat ? 1.1 : 0.25 },
      },
    ]);
    try {
      await context.wait(TIMINGS.handReturn);
      await waitForHandReturnClock(board, key, context);
    } finally {
      setDrawFlights((flights) => flights.filter((candidate) => candidate.key !== key));
    }
    await context.wait(TIMINGS.handReturnPause);
    return true;
  }

  async function flyPublicPileCard({ event, index, context }: Parameters<FlyPublicPileCard>[0]): Promise<void> {
    const board = anchors.board.current;
    const seat = event.fromSeat ?? event.seat;
    if (!board || seat === undefined || context.mode !== "live" || context.cancelled || context.skipping) {
      return;
    }
    const trash = board.querySelector(
      seat === viewerSeat ? ".game-utility-slot--you-trash" : ".game-utility-slot--opp-trash",
    );
    const deck = seat === viewerSeat ? anchors.yourDeck.current : anchors.oppDeck.current;
    const source = event.from === Zone.Deck ? deck : trash;
    const destination = event.placedUnder ? anchors.permanentCenter?.(event.placedUnder.permanentId) : undefined;
    if (!source || (event.placedUnder && !destination) || (!destination && !trash)) {
      return;
    }
    const boardRect = board.getBoundingClientRect();
    const sourceRect = source.getBoundingClientRect();
    const targetRect = trash?.getBoundingClientRect();
    if (!sourceRect.width || (!destination && !targetRect?.width)) {
      return;
    }
    const x = sourceRect.left + sourceRect.width / 2 - boardRect.left;
    const y = sourceRect.top + sourceRect.height / 2 - boardRect.top;
    const target = destination ?? {
      x: targetRect!.left + targetRect!.width / 2 - boardRect.left,
      y: targetRect!.top + targetRect!.height / 2 - boardRect.top,
    };
    const key = ++drawFlightKeyRef.current;
    const duration = isTouchLayout() ? TIMINGS.drawFlightTouch : TIMINGS.drawFlight;
    const cardId = event.cardIds?.[index];
    const artId = event.artIds?.[index];
    setDrawFlights((flights) => [
      ...flights,
      {
        key,
        x,
        y,
        dx: target.x - x,
        dy: target.y - y,
        duration,
        ...(cardId ? { card: { cardId, ...(artId ? { artId } : {}) } } : {}),
      },
    ]);
    try {
      await context.wait(duration);
    } finally {
      setDrawFlights((flights) => flights.filter((flight) => flight.key !== key));
    }
  }

  function launchHandTrashFlight(seat: Seat, card: DrawFlightCard) {
    const key = ++drawFlightKeyRef.current;
    const causingEffectGate = causingEffectGateRef.current;
    queue.enqueue({
      id: `hand-trash-${key}`,
      ...(presentationBatchRef?.current ? { origin: { ...presentationBatchRef.current } } : {}),
      track: "handTrash",
      holdsBoard: true,
      async run(context) {
        try {
          await waitForGate(causingEffectGate, context, CONSEQUENCE_GATE_MAX_MS, "handTrash/causingEffect");
          if (context.mode !== "live" || context.cancelled || context.skipping) {
            return;
          }
          const board = anchors.board.current;
          const hand = seat === viewerSeat ? anchors.yourHandDock.current : anchors.oppHandStrip.current;
          const trash = board?.querySelector<HTMLElement>(
            seat === viewerSeat ? ".game-utility-slot--you-trash" : ".game-utility-slot--opp-trash",
          );
          if (!board || !hand || !trash) {
            return;
          }
          const boardRect = board.getBoundingClientRect();
          const handRect = hand.getBoundingClientRect();
          const trashRect = trash.getBoundingClientRect();
          if (!handRect.width || !trashRect.width) {
            return;
          }
          const x = handRect.left + handRect.width / 2 - boardRect.left;
          const y = handRect.top + handRect.height / 2 - boardRect.top;
          setDrawFlights((flights) => [
            ...flights,
            {
              key,
              x,
              y,
              dx: trashRect.left + trashRect.width / 2 - boardRect.left - x,
              dy: trashRect.top + trashRect.height / 2 - boardRect.top - y,
              duration: TIMINGS.handReturn,
              card,
              handTrash: true,
            },
          ]);
          await context.wait(TIMINGS.handReturn);
          await waitForPaintedAnimation(
            () => board.querySelector<HTMLElement>(`[data-hand-trash="${key}"]`),
            "battle-hand-trash",
            TIMINGS.handReturn,
            context,
          );
        } finally {
          setDrawFlights((flights) => flights.filter((flight) => flight.key !== key));
        }
      },
    });
  }

  return {
    flyPublicPileCard,
    launchHandTrashFlight,
    flyCardUnder,
    flyCardToDeck,
    flyCardToHand,
    launchSecurityGainFlight,
    launchOpeningSecurityDeal,
    launchDrawFlight,
    launchDeckToSecurityFlight,
    launchDeckToUnderFlight,
  };
}
