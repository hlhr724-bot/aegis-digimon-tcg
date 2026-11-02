import { useEffect, useLayoutEffect, type MutableRefObject } from "react";
import { Phase, type GameState, type PlayerState, type Seat } from "@aegis/shared";
import { snapshotGameState, type StateSnapshot } from "../../../net/presentedState";
import type { PhaseBanner } from "../../phaseBanner";
import { Side } from "../../side";
import type { DrawFlightCard, DrawHandArrival, DrawPhaseOwner } from "../types";
import type { PresentationGate } from "../presentationGate";

/**
 * A hand that grew was drawn into.
 *
 * The opening hand and a mulligan redeal are not draws, so the first observed pair is only a
 * baseline. A draw an event already narrated is not flown twice, which is what the event
 * counts rule out.
 *
 * The held side keeps every figure it had — its count, the flag that says the growth is a
 * turn-start draw, and the event count that proves the draw was already narrated. They are
 * read again on the pass the Draw ribbon releases.
 */
export function useDrawWatcher({
  state,
  snapshots,
  viewer,
  opponent,
  viewerSeat,
  mulliganOpen,
  phaseBanner,
  drawPhaseWaitingRef,
  previousDrawStateRef,
  handCountsRef,
  turnStartDrawRef,
  eventDrawCountsRef,
  launchDrawFlight,
}: {
  state: GameState | undefined;
  snapshots?: readonly StateSnapshot[];
  viewer: PlayerState | undefined;
  opponent: PlayerState | undefined;
  viewerSeat: Seat;
  mulliganOpen: boolean;
  phaseBanner: PhaseBanner | null;
  drawPhaseWaitingRef: MutableRefObject<DrawPhaseOwner | null>;
  /** Mutated: the board the held seat's hand is still presented at. */
  previousDrawStateRef: MutableRefObject<GameState | undefined>;
  /** Mutated: the hand counts this pass compares against. */
  handCountsRef: MutableRefObject<{ you: number; opp: number } | null>;
  /** Mutated: which side's next growth is its turn-start draw. */
  turnStartDrawRef: MutableRefObject<{ you: boolean; opp: boolean }>;
  /** Mutated: the hand count an event-driven draw already accounted for. */
  eventDrawCountsRef: MutableRefObject<{ you?: number; opp?: number }>;
  launchDrawFlight: (
    side: Side,
    turnStart?: boolean,
    waitBeforeMs?: number,
    card?: DrawFlightCard,
    arrived?: PresentationGate,
    draw?: DrawHandArrival,
  ) => void;
}) {
  useEffect(() => {
    if (drawPhaseWaitingRef.current === null) {
      previousDrawStateRef.current = state ? snapshotGameState(state) : undefined;
    }
  }, [state, state?.stateVersion, viewer?.handCount, opponent?.handCount, phaseBanner]);
  useLayoutEffect(() => {
    if (viewer === undefined || opponent === undefined) return;
    const heldSeat = drawPhaseWaitingRef.current?.seat ?? null;
    const heldSide: Side | undefined =
      heldSeat === null ? undefined : heldSeat === viewerSeat ? Side.Viewer : Side.Opponent;
    const previous = handCountsRef.current;
    handCountsRef.current = {
      you: heldSide === Side.Viewer && previous ? previous.you : viewer.handCount,
      opp: heldSide === Side.Opponent && previous ? previous.opp : opponent.handCount,
    };
    if (!previous || mulliganOpen) {
      turnStartDrawRef.current = { you: false, opp: false };
      return;
    }
    const turnStart = turnStartDrawRef.current;
    // The bot can already be in Main while this Draw ribbon is opening. Hold the
    // card against the Draw batch's revision, rather than that newer live patch.
    const drawState =
      phaseBanner?.phase === "Draw"
        ? snapshots?.find((snapshot) => snapshot.stateVersion === phaseBanner.stateVersion)?.state
        : undefined;
    // An evicted/coalesced revision presents the live board immediately. Do not
    // invent a turn draw from later effect cards when its own snapshot is missing.
    const canPresentTurnDraw = phaseBanner?.stateVersion === undefined || snapshots === undefined || !!drawState;
    const opponentSeat: Seat = viewerSeat === 0 ? 1 : 0;
    const drawnOpponent = turnStart.opp ? (drawState?.players[opponentSeat] ?? opponent) : opponent;
    const drawnViewer = turnStart.you ? (drawState?.players[viewerSeat] ?? viewer) : viewer;
    // The hold keeps the count from before the Active phase. A start-of-turn effect draw
    // (EX2-059) was already presented by its own event, so it is not part of the turn draw.
    const turnDrawFrom = (seat: Seat, held: number) => {
      if (drawState === undefined) return held;
      const activeEnd = snapshots
        ?.filter(
          (snapshot) =>
            snapshot.stateVersion < drawState.stateVersion &&
            snapshot.state.phase === Phase.Active &&
            snapshot.state.turnSeat === seat &&
            snapshot.state.turnCount === drawState.turnCount,
        )
        .at(-1);
      return activeEnd?.state.players[seat]?.handCount ?? held;
    };
    const opponentFrom = turnStart.opp ? turnDrawFrom(opponentSeat, previous.opp) : previous.opp;
    const viewerFrom = turnStart.you ? turnDrawFrom(viewerSeat, previous.you) : previous.you;
    turnStartDrawRef.current = {
      you: heldSide === Side.Viewer && turnStart.you,
      opp: heldSide === Side.Opponent && turnStart.opp,
    };
    if (
      heldSide !== Side.Opponent &&
      (!turnStart.opp || canPresentTurnDraw) &&
      drawnOpponent.handCount > opponentFrom &&
      ((turnStart.opp && drawState !== undefined) || eventDrawCountsRef.current.opp !== drawnOpponent.handCount)
    )
      for (let index = opponentFrom; index < drawnOpponent.handCount; index++)
        launchDrawFlight(Side.Opponent, turnStart.opp, 0, undefined, undefined, {
          stateVersion: (turnStart.opp ? drawState?.stateVersion : undefined) ?? state?.stateVersion ?? 0,
          handCountAfter: drawnOpponent.handCount,
          deckCountAfter: drawnOpponent.deckCount,
        });
    if (
      heldSide !== Side.Viewer &&
      (!turnStart.you || canPresentTurnDraw) &&
      drawnViewer.handCount > viewerFrom &&
      ((turnStart.you && drawState !== undefined) || eventDrawCountsRef.current.you !== drawnViewer.handCount)
    )
      for (let index = viewerFrom; index < drawnViewer.handCount; index++) {
        const card = drawnViewer.hand[drawnViewer.hand.length - (drawnViewer.handCount - index)];
        launchDrawFlight(
          Side.Viewer,
          turnStart.you,
          0,
          card?.cardId ? { cardId: card.cardId, ...(card.artId ? { artId: card.artId } : {}) } : undefined,
          undefined,
          {
            ...(card ? { instanceId: card.instanceId } : {}),
            stateVersion: (turnStart.you ? drawState?.stateVersion : undefined) ?? state?.stateVersion ?? 0,
            handCountAfter: drawnViewer.handCount,
            deckCountAfter: drawnViewer.deckCount,
          },
        );
      }
    eventDrawCountsRef.current = heldSide ? { [heldSide]: eventDrawCountsRef.current[heldSide] } : {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer?.handCount, opponent?.handCount, phaseBanner]);
}
