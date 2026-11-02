// @vitest-environment jsdom
import { ANIMATION_SPEED_CHANNEL, CardInstance, GameState, PendingDecision, Phase, PlayerState } from "@aegis/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { GameScreen } from "./GameScreen";
import { CardConfirmationMode } from "@/game/cardConfirmation/CardConfirmationMode";
import { cardConfirmationPreference } from "@/game/cardConfirmation/cardConfirmationPreference";
import type { AegisRoom } from "../net/client";

afterEach(cleanup);
function mountHand() {
  localStorage.setItem("aegis.locale", "en");
  const state = new GameState();
  state.phase = Phase.Main;
  state.turnSeat = 1;
  for (const seat of [0, 1] as const) {
    const p = new PlayerState();
    p.seat = seat;
    p.sessionId = `manual-${seat}`;
    state.players.push(p);
  }
  for (const instanceId of ["a", "b", "c"]) {
    const card = new CardInstance();
    card.instanceId = instanceId;
    card.cardId = "BT1-009";
    state.players[0]!.hand.push(card);
  }
  const send = vi.fn<(type: string, payload: unknown) => void>();
  const room = {
    state,
    connection: { isOpen: true },
    send: (type: string, payload: unknown) => (type === ANIMATION_SPEED_CHANNEL ? undefined : send(type, payload)),
    onMessage: () => () => {},
  } as unknown as AegisRoom;
  const connection = {
    room,
    status: "connected" as const,
    error: undefined,
    decision: undefined,
    state,
    events: [],
    acknowledgeDecision: () => undefined,
    sessionId: "manual-0",
    roomCode: "",
  };
  const view = () => (
    <I18nProvider>
      <GameScreen
        joinOptions={{ displayName: "Player", deck: { mainDeck: [], eggDeck: [] } }}
        identityColor="Blue"
        onExit={() => undefined}
        demoConnection={connection}
      />
    </I18nProvider>
  );
  const mounted = render(view());
  const row = screen.getByTestId("hand");
  row.getBoundingClientRect = () => ({
    x: 0,
    y: 600,
    left: 0,
    right: 300,
    top: 600,
    bottom: 800,
    width: 300,
    height: 200,
    toJSON: () => {},
  });
  row.closest<HTMLElement>(".game-hand-scroller")!.getBoundingClientRect = row.getBoundingClientRect;
  for (const [index, card] of [...row.querySelectorAll<HTMLElement>("[data-hand-instance-id]")].entries()) {
    card.getBoundingClientRect = () => ({
      x: index * 100,
      y: 600,
      left: index * 100,
      right: index * 100 + 100,
      top: 600,
      bottom: 800,
      width: 100,
      height: 200,
      toJSON: () => {},
    });
  }
  return {
    row,
    state,
    send,
    refresh: () => mounted.rerender(view()),
    ids: () =>
      [...row.querySelectorAll<HTMLElement>("[data-hand-instance-id]")].map((card) => card.dataset.handInstanceId),
  };
}
function pointer(target: EventTarget, type: string, x: number, y: number, pointerType = "mouse") {
  act(() =>
    target.dispatchEvent(
      new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType }),
    ),
  );
}
it.each(["mouse", "touch"])(
  "manually moves duplicate instances on the opponent's turn without sending an intent (%s)",
  (pointerType) => {
    const { row, ids, state, send } = mountHand();
    const card = row.querySelector<HTMLElement>('[data-hand-instance-id="a"]')!;
    pointer(card, "pointerdown", 20, 680, pointerType);
    if (pointerType === "touch") pointer(window, "pointermove", 20, 650, pointerType);
    pointer(window, "pointermove", 285, 680, pointerType);
    pointer(window, "pointerup", 285, 680, pointerType);
    expect(ids()).toEqual(["b", "c", "a"]);
    expect([...state.players[0]!.hand].map((instance) => instance.instanceId)).toEqual(["a", "b", "c"]);
    expect(send).not.toHaveBeenCalled();
    expect(screen.queryByTestId("drag-ghost")).toBeNull();
  },
);
it("keeps touch swipes for scrolling and cancels a reorder released outside the hand", () => {
  const { row, ids, send } = mountHand();
  const card = row.querySelector<HTMLElement>('[data-hand-instance-id="a"]')!;
  pointer(card, "pointerdown", 20, 680, "touch");
  pointer(window, "pointermove", 285, 680, "touch");
  pointer(window, "pointerup", 285, 680, "touch");
  expect(ids()).toEqual(["a", "b", "c"]);
  pointer(card, "pointerdown", 20, 680);
  pointer(window, "pointermove", 285, 300);
  pointer(window, "pointerup", 285, 300);
  expect(ids()).toEqual(["a", "b", "c"]);
  expect(send).not.toHaveBeenCalled();
});
it("offers keyboard reordering and appends later draws", () => {
  const { row, ids, state, refresh, send } = mountHand();
  fireEvent.keyDown(row.querySelector('[data-hand-instance-id="b"]')!, { key: "ArrowLeft", altKey: true });
  expect(ids()).toEqual(["b", "a", "c"]);
  const card = new CardInstance();
  card.cardId = "BT1-009";
  card.instanceId = "new";
  state.players[0]!.hand.push(card);
  refresh();
  expect(ids()).toEqual(["b", "a", "c", "new"]);
  expect(send).not.toHaveBeenCalled();
});

it("cancels when the pointer is interrupted or the card leaves the live hand", () => {
  const { row, ids, state, refresh, send } = mountHand();
  const card = row.querySelector<HTMLElement>('[data-hand-instance-id="a"]')!;
  pointer(card, "pointerdown", 20, 680);
  pointer(window, "pointermove", 285, 680);
  pointer(window, "pointercancel", 285, 680);
  expect(ids()).toEqual(["a", "b", "c"]);
  pointer(card, "pointerdown", 20, 680);
  pointer(window, "pointermove", 285, 680);
  state.players[0]!.hand.splice(0, 1);
  refresh();
  pointer(window, "pointerup", 285, 680);
  expect(ids()).toEqual(["b", "c"]);
  expect(send).not.toHaveBeenCalled();
});

it("blocks reordering while a server decision is pending", () => {
  const { row, ids, state, refresh, send } = mountHand();
  state.pendingDecision = new PendingDecision();
  refresh();
  const card = row.querySelector<HTMLElement>('[data-hand-instance-id="a"]')!;
  pointer(card, "pointerdown", 20, 680);
  pointer(window, "pointermove", 285, 680);
  pointer(window, "pointerup", 285, 680);
  fireEvent.keyDown(card, { key: "ArrowRight", altKey: true });
  expect(ids()).toEqual(["a", "b", "c"]);
  expect(send).not.toHaveBeenCalled();
});

it("still plays the physical instance dragged from its reordered position onto the battle area", () => {
  cardConfirmationPreference.setMode(CardConfirmationMode.NEVER.value);
  try {
    const { row, ids, state, refresh, send } = mountHand();
    fireEvent.keyDown(row.querySelector('[data-hand-instance-id="b"]')!, { key: "ArrowLeft", altKey: true });
    expect(ids()).toEqual(["b", "a", "c"]);
    state.turnSeat = 0;
    state.players[0]!.hand[1]!.playableFromHand = true;
    state.players[0]!.hand[1]!.projectedPlayCost = 3;
    refresh();
    const battle = document.querySelector<HTMLElement>('[data-drop="battle-you"]')!;
    battle.getBoundingClientRect = () => ({
      x: 0,
      y: 300,
      left: 0,
      right: 300,
      top: 300,
      bottom: 500,
      width: 300,
      height: 200,
      toJSON: () => {},
    });
    const card = row.querySelector<HTMLElement>('[data-hand-instance-id="b"]')!;
    pointer(card, "pointerdown", 20, 680);
    pointer(window, "pointermove", 150, 400);
    pointer(window, "pointerup", 150, 400);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("playCard", expect.objectContaining({ instanceId: "b" }));
    expect([...state.players[0]!.hand].map((instance) => instance.instanceId)).toEqual(["a", "b", "c"]);
  } finally {
    cardConfirmationPreference.setMode(CardConfirmationMode.ALWAYS.value);
  }
});

it("ignores drops outside the visible mobile scroller even if the overflow row continues there", () => {
  const { row, ids, send } = mountHand();
  const scroller = row.closest<HTMLElement>(".game-hand-scroller")!;
  scroller.style.display = "block";
  scroller.getBoundingClientRect = () => ({
    x: 0,
    y: 600,
    left: 0,
    right: 200,
    top: 600,
    bottom: 800,
    width: 200,
    height: 200,
    toJSON: () => {},
  });
  pointer(row.querySelector('[data-hand-instance-id="a"]')!, "pointerdown", 20, 680);
  pointer(window, "pointermove", 285, 680);
  pointer(window, "pointerup", 285, 680);
  expect(ids()).toEqual(["a", "b", "c"]);
  expect(send).not.toHaveBeenCalled();
});
