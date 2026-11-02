// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CardInstance, GameState, Phase, PlayerState } from "@aegis/shared";
import { snapshotGameState } from "../../../net/presentedState";
import { Side } from "../../side";
import { useDrawWatcher } from "./useDrawWatcher";

afterEach(cleanup);

it.each([
  { seat: 0, mode: "newer hand" },
  { seat: 1, mode: "newer hand" },
  { seat: 0, mode: "claimed effect draw" },
  { seat: 1, mode: "claimed effect draw" },
  { seat: 0, mode: "missing revision" },
  { seat: 1, mode: "missing revision" },
] as const)("handles seat$seat's turn draw with a $mode", ({ seat, mode }) => {
  const before = new GameState();
  before.stateVersion = 1;
  for (const currentSeat of [0, 1] as const) {
    const player = new PlayerState();
    player.seat = currentSeat;
    player.handCount = 5;
    player.deckCount = 40;
    before.players.push(player);
  }
  const drawn = snapshotGameState(before);
  drawn.stateVersion = 2;
  drawn.players[seat]!.handCount = 6;
  drawn.players[seat]!.deckCount = 39;
  if (seat === 0) {
    const card = new CardInstance();
    card.instanceId = "turn-draw";
    card.cardId = "BT1-010";
    drawn.players[seat]!.hand.push(card);
  }
  const live = snapshotGameState(drawn);
  live.stateVersion = 3;
  live.players[seat]!.handCount = mode === "claimed effect draw" ? 6 : 8;
  live.players[seat]!.deckCount = mode === "claimed effect draw" ? 38 : 37;
  const launchDrawFlight = vi.fn<Parameters<typeof useDrawWatcher>[0]["launchDrawFlight"]>();
  const turnStartDrawRef = { current: { you: false, opp: false } };
  const props: Parameters<typeof useDrawWatcher>[0] = {
    state: before,
    viewer: before.players[0],
    opponent: before.players[1],
    viewerSeat: 0,
    mulliganOpen: false,
    phaseBanner: null,
    drawPhaseWaitingRef: { current: null },
    previousDrawStateRef: { current: undefined },
    handCountsRef: { current: null },
    turnStartDrawRef,
    eventDrawCountsRef: { current: {} },
    launchDrawFlight,
  };
  const { rerender } = renderHook(useDrawWatcher, { initialProps: props });
  if (mode === "claimed effect draw") props.eventDrawCountsRef.current[seat === 0 ? "you" : "opp"] = 6;
  turnStartDrawRef.current = { you: seat === 0, opp: seat === 1 };
  rerender({
    ...props,
    state: live,
    viewer: live.players[0],
    opponent: live.players[1],
    snapshots: mode === "missing revision" ? [{ stateVersion: 3, state: live }] : [{ stateVersion: 2, state: drawn }],
    phaseBanner: {
      key: 1,
      phase: "Draw",
      labelKey: "game.phaseBanner.draw",
      side: seat === 0 ? Side.Viewer : Side.Opponent,
      stateVersion: 2,
    },
  });
  expect(launchDrawFlight).toHaveBeenCalledTimes(mode === "missing revision" ? 0 : 1);
  if (mode === "missing revision") return;
  expect(launchDrawFlight.mock.calls[0]![0]).toBe(seat === 0 ? Side.Viewer : Side.Opponent);
  expect(launchDrawFlight.mock.calls[0]![1]).toBe(true);
  expect(launchDrawFlight.mock.calls[0]![5]).toMatchObject({
    stateVersion: 2,
    handCountAfter: 6,
    deckCountAfter: 39,
  });
  expect(launchDrawFlight.mock.calls[0]![3]).toEqual(seat === 0 ? { cardId: "BT1-010" } : undefined);
});

function handCard(instanceId: string, cardId: string) {
  const card = new CardInstance();
  card.instanceId = instanceId;
  card.cardId = cardId;
  return card;
}

// EX2-059 Shu-Chong Wong draws in the Active phase; the Draw phase then adds its own card.
it.each([0, 1] as const)(
  "presents only the Draw phase card as seat%s's turn draw after a start-of-turn effect draw",
  (seat) => {
    const before = new GameState();
    before.stateVersion = 14;
    before.phase = Phase.Active;
    before.turnSeat = seat;
    for (const currentSeat of [0, 1] as const) {
      const player = new PlayerState();
      player.seat = currentSeat;
      player.handCount = 2;
      player.deckCount = 18;
      if (currentSeat === 0) player.hand.push(handCard("kept-1", "BT1-009"), handCard("kept-2", "BT1-013"));
      before.players.push(player);
    }
    const effectDrawn = snapshotGameState(before);
    effectDrawn.stateVersion = 16;
    effectDrawn.players[seat]!.handCount = 3;
    effectDrawn.players[seat]!.deckCount = 17;
    if (seat === 0) effectDrawn.players[seat]!.hand.push(handCard("effect-draw", "BT1-009"));
    const turnDrawn = snapshotGameState(effectDrawn);
    turnDrawn.stateVersion = 17;
    turnDrawn.phase = Phase.Draw;
    turnDrawn.players[seat]!.handCount = 4;
    turnDrawn.players[seat]!.deckCount = 16;
    if (seat === 0) turnDrawn.players[seat]!.hand.push(handCard("turn-draw", "BT1-013"));
    const launchDrawFlight = vi.fn<Parameters<typeof useDrawWatcher>[0]["launchDrawFlight"]>();
    const side = seat === 0 ? Side.Viewer : Side.Opponent;
    const drawPhaseWaitingRef: Parameters<typeof useDrawWatcher>[0]["drawPhaseWaitingRef"] = {
      current: { seat, phaseOrder: 1 },
    };
    const turnStartDrawRef = { current: { you: false, opp: false } };
    const props: Parameters<typeof useDrawWatcher>[0] = {
      state: before,
      viewer: before.players[0],
      opponent: before.players[1],
      viewerSeat: 0,
      mulliganOpen: false,
      phaseBanner: null,
      drawPhaseWaitingRef,
      previousDrawStateRef: { current: undefined },
      handCountsRef: { current: null },
      turnStartDrawRef,
      eventDrawCountsRef: { current: {} },
      launchDrawFlight,
    };
    const { rerender } = renderHook(useDrawWatcher, { initialProps: props });
    // The effect draw is presented by its own event while the turn's hold keeps the old count.
    props.eventDrawCountsRef.current[seat === 0 ? "you" : "opp"] = 3;
    rerender({ ...props, state: effectDrawn, viewer: effectDrawn.players[0], opponent: effectDrawn.players[1] });
    expect(launchDrawFlight).not.toHaveBeenCalled();

    turnStartDrawRef.current = { you: seat === 0, opp: seat === 1 };
    drawPhaseWaitingRef.current = null;
    rerender({
      ...props,
      state: turnDrawn,
      viewer: turnDrawn.players[0],
      opponent: turnDrawn.players[1],
      snapshots: [
        { stateVersion: 14, state: snapshotGameState(before) },
        { stateVersion: 16, state: effectDrawn },
        { stateVersion: 17, state: turnDrawn },
      ],
      phaseBanner: { key: 2, phase: "Draw", labelKey: "game.phaseBanner.draw", side, stateVersion: 17 },
    });
    expect(launchDrawFlight).toHaveBeenCalledTimes(1);
    expect(launchDrawFlight.mock.calls[0]![0]).toBe(side);
    expect(launchDrawFlight.mock.calls[0]![1]).toBe(true);
    expect(launchDrawFlight.mock.calls[0]![3]).toEqual(seat === 0 ? { cardId: "BT1-013" } : undefined);
    expect(launchDrawFlight.mock.calls[0]![5]).toMatchObject({
      ...(seat === 0 ? { instanceId: "turn-draw" } : {}),
      stateVersion: 17,
      handCountAfter: 4,
      deckCountAfter: 16,
    });
  },
);
