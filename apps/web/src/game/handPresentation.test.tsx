// @vitest-environment jsdom
import {
  CardInstance,
  GameState,
  Phase,
  PlayerState,
  Permanent,
  type ServerEvent,
  type SequencedServerEvent,
} from "@aegis/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import type { AegisRoom } from "../net/client";
import { snapshotGameState } from "../net/presentedState";
import type { ServerBatch } from "../net/serverBatches";
import { GameScreen } from "./GameScreen";
import { HandSortMode, setHandSortMode } from "./handSortMode";
import { HandSortDirection } from "@/game/HandSortDirection";
import { setHandSortDirection } from "@/game/handSortDirectionPreference";
import { TIMINGS } from "./timings";

afterEach(() => {
  cleanup();
  setHandSortMode(HandSortMode.Type);
  setHandSortDirection(HandSortDirection.ASCENDING.value);
  vi.useRealTimers();
});

it.each(["deck", "trash"])(
  "shows cards added from %s while earlier effect narration is still being presented",
  async (from) => {
    vi.useFakeTimers();
    const state = new GameState();
    state.phase = Phase.Main;
    state.turnSeat = 0;
    state.stateVersion = 1;
    for (const seat of [0, 1] as const) {
      const player = new PlayerState();
      player.seat = seat;
      player.sessionId = `session-${seat}`;
      state.players.push(player);
    }
    const source = new Permanent();
    source.permanentId = "source";
    source.controllerSeat = 0;
    source.topCard = new CardInstance();
    source.topCard.instanceId = "source-card";
    source.topCard.cardId = "BT12-021";
    state.players[0]!.battleArea.push(source);
    const before = snapshotGameState(state);
    const room = {
      connection: { isOpen: true },
      send: vi.fn<(type: string, payload: unknown) => void>(),
      onMessage: () => () => {},
    } as unknown as AegisRoom;
    const events: SequencedServerEvent[] = [];
    const batches: ServerBatch[] = [];
    function append(batchEvents: ServerEvent[], version: number) {
      const id = `batch-${batches.length}`;
      batches.push({
        id,
        stateVersion: version,
        events: batchEvents.map((event, index) => ({
          ...event,
          seq: events.length + index,
          batch: id,
          stateVersion: version,
        })),
      });
      events.push(...batches.at(-1)!.events);
    }
    const view = () => (
      <I18nProvider>
        <GameScreen
          joinOptions={{ displayName: "You", deck: { mainDeck: [], eggDeck: [] } }}
          identityColor="Blue"
          onExit={() => undefined}
          demoConnection={{
            room,
            status: "connected",
            error: undefined,
            decision: undefined,
            state,
            events: [...events],
            batches: [...batches],
            snapshots: [{ stateVersion: 1, state: before }],
            acknowledgeDecision: () => undefined,
            sessionId: "session-0",
            roomCode: "",
          }}
        />
      </I18nProvider>
    );
    const rendered = render(view());
    append(
      [0, 1, 2].map((index) => ({
        kind: "effectTriggered",
        seat: 0,
        sourceCardId: "BT12-021",
        sourceInstanceId: "source-card",
        sourcePermanentId: "source",
        effectKey: `effect-${index}`,
        description: "Add the revealed card to your hand.",
        timing: "YourTurn",
      })),
      1,
    );
    rendered.rerender(view());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TIMINGS.effectSourceHold + 1);
    });
    // The notice prints the source card's own clause, so this asserts a clause is on screen
    // rather than the words the fixture used to summarize the same moment.
    expect(document.querySelectorAll(".match-notice__text").length).toBeGreaterThan(0);

    const received = new CardInstance();
    received.instanceId = "received-card";
    received.cardId = "ST1-07";
    received.ownerSeat = 0;
    state.players[0]!.hand.push(received);
    state.players[0]!.handCount = 1;
    state.stateVersion = 2;
    append([{ kind: "cardsMoved", instanceIds: [received.instanceId], from, to: "hand", seat: 0 }], 2);
    rendered.rerender(view());
    expect(screen.getByTestId("hand").querySelectorAll(".game-hand-card")).toHaveLength(1);
    // The notice prints the source card's own clause, so this asserts a clause is on screen
    // rather than the words the fixture used to summarize the same moment.
    expect(document.querySelectorAll(".match-notice__text").length).toBeGreaterThan(0);

    // A later confirmed removal also updates the hand while narration continues.
    state.players[0]!.hand.pop();
    state.players[0]!.handCount = 0;
    state.stateVersion = 3;
    append([{ kind: "cardsMoved", instanceIds: [received.instanceId], from: "hand", to: "trash", seat: 0 }], 3);
    rendered.rerender(view());
    expect(screen.getByTestId("hand").querySelectorAll(".game-hand-card")).toHaveLength(0);
  },
);

it("sorts from the hand tray without opening settings and appends later draws", async () => {
  localStorage.setItem("aegis.locale", "en");
  const state = new GameState();
  state.phase = Phase.Main;
  state.turnSeat = 0;
  for (const seat of [0, 1] as const) {
    const player = new PlayerState();
    player.seat = seat;
    player.sessionId = `sort-${seat}`;
    state.players.push(player);
  }
  for (const [index, cardId] of ["BT1-087", "BT1-009", "BT1-084"].entries()) {
    const card = new CardInstance();
    card.cardId = cardId;
    card.instanceId = `sort-card-${index}`;
    state.players[0]!.hand.push(card);
  }
  const connection = {
    room: undefined,
    status: "connected" as const,
    error: undefined,
    decision: undefined,
    state,
    events: [],
    acknowledgeDecision: () => undefined,
    sessionId: "sort-0",
    roomCode: "",
  };
  const view = () => (
    <I18nProvider>
      <GameScreen
        joinOptions={{ displayName: "You", deck: { mainDeck: [], eggDeck: [] } }}
        identityColor="Blue"
        onExit={() => undefined}
        demoConnection={connection}
      />
    </I18nProvider>
  );
  const rendered = render(view());
  const button = screen.getByRole("button", { name: "Sort hand: By type, Low to high" });
  expect(button.closest(".game-player-dock")?.querySelector('[data-testid="hand"]')).toBeTruthy();
  expect(screen.queryByRole("dialog", { name: "Match settings" })).toBeNull();
  const ids = () =>
    [...document.querySelectorAll<HTMLElement>('[data-testid="hand"] [data-hand-instance-id]')].map(
      (card) => card.dataset.handInstanceId,
    );
  expect(ids()).toEqual(["sort-card-0", "sort-card-1", "sort-card-2"]);
  fireEvent.click(button);
  expect(ids()).toEqual(["sort-card-1", "sort-card-2", "sort-card-0"]);
  const draw = new CardInstance();
  draw.cardId = "BT1-009";
  draw.instanceId = "later-draw";
  state.players[0]!.hand.push(draw);
  rendered.rerender(view());
  expect(ids()).toEqual(["sort-card-1", "sort-card-2", "sort-card-0", "later-draw"]);
  fireEvent.click(button);
  expect(ids()).toEqual(["sort-card-1", "later-draw", "sort-card-2", "sort-card-0"]);

  fireEvent.click(screen.getByRole("button", { name: "Choose sort order" }));
  expect(screen.getByRole("menuitemradio", { name: "By type" }).getAttribute("aria-checked")).toBe("true");
  fireEvent.click(screen.getByRole("menuitemradio", { name: "By cost" }));
  expect(screen.queryByRole("menu")).toBeNull();
  expect(ids()).toEqual(["sort-card-1", "later-draw", "sort-card-0", "sort-card-2"]);
  expect(screen.getByRole("button", { name: "Sort hand: By cost, Low to high" })).toBeTruthy();
  expect(localStorage.getItem("aegis.hand.sort-mode")).toBe("cost");

  fireEvent.click(screen.getByRole("button", { name: "Choose sort order" }));
  expect(screen.getByRole("menuitemradio", { name: "Low to high" }).getAttribute("aria-checked")).toBe("true");
  fireEvent.click(screen.getByRole("menuitemradio", { name: "High to low" }));
  expect(screen.queryByRole("menu")).toBeNull();
  expect(ids()).toEqual(["sort-card-2", "sort-card-0", "sort-card-1", "later-draw"]);
  expect(screen.getByRole("button", { name: "Sort hand: By cost, High to low" })).toBeTruthy();
  expect(localStorage.getItem("aegis.hand.sort-direction")).toBe("descending");
});

it.each([0, 1])("shows all redealt physical cards when a mulligan retains %s original identities", (retained) => {
  vi.useFakeTimers();
  const state = new GameState();
  state.phase = Phase.None;
  state.stateVersion = 1;
  for (const seat of [0, 1] as const) {
    const player = new PlayerState();
    player.seat = seat;
    player.sessionId = `redeal-seat-${seat}`;
    player.handCount = 5;
    player.deckCount = 45;
    state.players.push(player);
  }
  for (let index = 0; index < 5; index++) {
    state.players[0]!.hand.push(
      Object.assign(new CardInstance(), { instanceId: `opening-${index}`, cardId: "ST1-03" }),
    );
  }
  const before = snapshotGameState(state);
  const view = () => (
    <I18nProvider>
      <GameScreen
        joinOptions={{ displayName: "You", deck: { mainDeck: [], eggDeck: [] } }}
        identityColor="Blue"
        onExit={() => undefined}
        demoConnection={{
          room: undefined,
          status: "connected",
          error: undefined,
          decision: undefined,
          state,
          events: [],
          batches: [],
          snapshots: [{ stateVersion: 1, state: before }],
          acknowledgeDecision: () => undefined,
          sessionId: "redeal-seat-0",
          roomCode: "",
        }}
      />
    </I18nProvider>
  );
  const rendered = render(view());
  const ids = () =>
    [...document.querySelectorAll<HTMLElement>('[data-testid="hand"] [data-hand-instance-id]')].map(
      (card) => card.dataset.handInstanceId,
    );
  expect(ids()).toHaveLength(5);
  for (let index = retained; index < 5; index++) {
    state.players[0]!.hand[index] = Object.assign(new CardInstance(), {
      instanceId: `redealt-${index}`,
      cardId: "ST1-03",
    });
  }
  rendered.rerender(view());
  expect(ids()).toEqual(
    Array.from({ length: 5 }, (_, index) => (index < retained ? `opening-${index}` : `redealt-${index}`)),
  );
});
