// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CardInstance, GameState, PlayerState, Phase } from "@aegis/shared";
import { snapshotGameState } from "../../net/presentedState";
import { singleServerBatch, type ServerBatch } from "../../net/serverBatches";
import { useMatchCues, type MatchCueAnchors } from "../useMatchCues";
import { presentedSeats } from "../screen/model/presentedSeats";
import { REVEAL_SHOWCASE_TOTAL_MS } from "../timings";
import type { AnimationQueue } from "../animationQueue";
import { observeGateExpiry, type GateExpiry } from "./presentationGate";

vi.mock("../../design/sound", () => ({ playSound: vi.fn<(kind: string) => void>() }));
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
function card(id: string) {
  const result = new CardInstance();
  result.instanceId = id;
  result.cardId = "ST1-03";
  return result;
}
function initial() {
  const result = new GameState();
  result.stateVersion = 1;
  result.phase = Phase.Main;
  for (const seat of [0, 1] as const) {
    const player = new PlayerState();
    player.seat = seat;
    player.handCount = 1;
    player.deckCount = 30;
    if (seat === 0) player.hand.push(card("kept"));
    result.players.push(player);
  }
  return result;
}
function anchors(): MatchCueAnchors {
  const board = document.createElement("div");
  const deck = document.createElement("div");
  const hand = document.createElement("div");
  vi.spyOn(board, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 700));
  vi.spyOn(deck, "getBoundingClientRect").mockReturnValue(new DOMRect(650, 500, 60, 84));
  vi.spyOn(hand, "getBoundingClientRect").mockReturnValue(new DOMRect(200, 600, 400, 100));
  return {
    board: { current: board },
    yourDeck: { current: deck },
    oppDeck: { current: deck },
    yourHandDock: { current: hand },
    oppHandStrip: { current: hand },
    yourSecurity: { current: null },
    oppSecurity: { current: null },
    permanentCenter: () => undefined,
  };
}

it("pins a coalesced draw to its own snapshot and retains its exact ID after a later hand-count drop", async () => {
  const before = initial();
  const drawn = snapshotGameState(before);
  drawn.stateVersion = 2;
  drawn.players[0]!.hand.push(card("new"));
  drawn.players[0]!.handCount = 2;
  drawn.players[0]!.deckCount = 29;
  const live = snapshotGameState(drawn);
  live.stateVersion = 3;
  live.players[0]!.hand.splice(0, 1);
  live.players[0]!.handCount = 1;
  const layout = anchors();
  const snapshots = [before, drawn, live].map((state) => ({ stateVersion: state.stateVersion, state }));
  const { result, rerender } = renderHook(
    ({ state, batches }: { state: GameState; batches: readonly ServerBatch[] }) =>
      useMatchCues({
        state,
        batches,
        snapshots,
        viewerSeat: 0,
        mulliganOpen: false,
        anchors: layout,
        presentationPacing: "sequential",
        onActionRejected() {},
      }),
    { initialProps: { state: before, batches: [] as readonly ServerBatch[] } },
  );
  await advance(0);
  rerender({
    state: live,
    batches: [singleServerBatch([{ kind: "cardsMoved", from: "deck", to: "hand", seat: 0, instanceIds: ["new"] }], 2)],
  });
  await advance(0);
  expect([...result.current.heldHandArrivals.values()][0]).toMatchObject({
    stateVersion: 2,
    instanceId: "new",
    handCountAfter: 2,
    deckCountAfter: 29,
  });
  function shown(shownState: GameState) {
    return presentedSeats({
      shownState,
      viewer: live.players[0]!,
      opponent: live.players[1]!,
      viewerSeat: 0,
      heldPhaseState: undefined,
      heldBlowState: undefined,
      heldSecurityEffectState: undefined,
      heldDrawState: undefined,
      heldBreedingState: undefined,
      heldDeletions: new Map(),
      heldTrashArrivals: new Map(),
      heldHandArrivals: result.current.heldHandArrivals,
      optimisticPlayedInstanceId: undefined,
      presentationPacing: "sequential",
    });
  }
  expect(shown(drawn).shownHand!.map((entry) => entry.instanceId)).toEqual(["kept"]);
  expect(shown(drawn).shownViewer).toMatchObject({ handCount: 1, deckCount: 30 });
  expect(shown(live).shownHand).toHaveLength(0);
  expect(shown(live).shownHandCount).toBe(0);
  await advance(209);
  expect(result.current.heldHandArrivals.size).toBe(1);
  await advance(1);
  expect(result.current.heldHandArrivals.size).toBe(0);
});

it("holds a checked security card that a coalesced patch leaked into the reveal snapshot (Discord 1557410815466938429)", async () => {
  const before = initial();
  for (const player of before.players) player.securityCount = 5;
  const revealed = snapshotGameState(before);
  revealed.stateVersion = 2;
  revealed.players[0]!.securityCount = 4;
  revealed.players[0]!.hand.push(card("horn"));
  revealed.players[0]!.handCount = 2;
  const live = snapshotGameState(revealed);
  live.stateVersion = 3;
  const layout = anchors();
  const snapshots = [before, revealed, live].map((state) => ({ stateVersion: state.stateVersion, state }));
  const { result, rerender } = renderHook(
    ({ state, batches }: { state: GameState; batches: readonly ServerBatch[] }) =>
      useMatchCues({
        state,
        batches,
        snapshots,
        viewerSeat: 0,
        mulliganOpen: false,
        anchors: layout,
        presentationPacing: "sequential",
        onActionRejected() {},
      }),
    { initialProps: { state: before, batches: [] as readonly ServerBatch[] } },
  );
  await advance(0);
  rerender({
    state: live,
    batches: [
      singleServerBatch(
        [
          {
            kind: "cardsMoved",
            from: "various",
            to: "hand",
            seat: 0,
            instanceIds: ["horn"],
            handAddition: "transfer",
            fromSecurityCheck: true,
          },
        ],
        3,
      ),
    ],
  });
  // Without a causing [Security] clause to wait for, the entry starts on the next tick,
  // so read the hold the batch registered before any timer runs.
  expect([...result.current.heldHandArrivals.values()][0]).toMatchObject({
    stateVersion: 3,
    instanceId: "horn",
    fromDeck: false,
    fromSecurity: true,
    securityCountAfter: 4,
  });
  const shown = presentedSeats({
    shownState: revealed,
    viewer: live.players[0]!,
    opponent: live.players[1]!,
    viewerSeat: 0,
    heldPhaseState: undefined,
    heldBlowState: undefined,
    heldSecurityEffectState: undefined,
    heldDrawState: undefined,
    heldBreedingState: undefined,
    heldDeletions: new Map(),
    heldTrashArrivals: new Map(),
    heldHandArrivals: result.current.heldHandArrivals,
    optimisticPlayedInstanceId: undefined,
    presentationPacing: "sequential",
  });
  expect(shown.shownHand!.map((entry) => entry.instanceId)).toEqual(["kept"]);
  expect(shown.shownViewer).toMatchObject({ handCount: 1, deckCount: 30 });
});

it.each([false, true])("keeps a public deck draw behind its matching reveal (separate batch=%s)", async (split) => {
  const before = initial();
  const after = snapshotGameState(before);
  after.stateVersion = 2;
  after.players[1]!.handCount = 2;
  after.players[1]!.deckCount = 29;
  const layout = anchors();
  const { result, rerender } = renderHook(
    ({ state, batches }: { state: GameState; batches: readonly ServerBatch[] }) =>
      useMatchCues({
        state,
        batches,
        viewerSeat: 0,
        mulliganOpen: false,
        anchors: layout,
        onActionRejected() {},
      }),
    { initialProps: { state: before, batches: [] as readonly ServerBatch[] } },
  );
  await advance(0);
  const revealBatch = singleServerBatch([{ kind: "cardRevealed", seat: 1, cardId: "ST1-03" }], 1);
  if (split) {
    rerender({ state: before, batches: [revealBatch] });
    await advance(0);
  }
  rerender({
    state: after,
    batches: split
      ? [
          revealBatch,
          singleServerBatch(
            [
              {
                kind: "cardsMoved",
                from: "deck",
                to: "hand",
                seat: 1,
                instanceIds: ["public-new"],
                cardIds: ["ST1-03"],
                handAddition: "draw",
              },
            ],
            2,
          ),
        ]
      : [
          singleServerBatch(
            [
              { kind: "cardRevealed", seat: 1, cardId: "ST1-03" },
              {
                kind: "cardsMoved",
                from: "deck",
                to: "hand",
                seat: 1,
                instanceIds: ["public-new"],
                cardIds: ["ST1-03"],
                handAddition: "draw",
              },
            ],
            2,
          ),
        ],
  });
  await advance(0);
  expect(result.current.revealShowcase).not.toBeNull();
  expect(result.current.drawFlights).toHaveLength(0);
  expect(result.current.heldHandArrivals.size).toBe(1);
  await advance(REVEAL_SHOWCASE_TOTAL_MS - 1);
  expect(result.current.drawFlights).toHaveLength(0);
  await advance(33);
  expect(result.current.revealShowcase).toBeNull();
  expect(result.current.drawFlights).toHaveLength(1);
  expect(result.current.drawFlights[0]!.card?.cardId).toBe("ST1-03");
  expect(result.current.heldHandArrivals.size).toBe(1);
  await advance(170);
  expect(result.current.heldHandArrivals.size).toBe(0);
});

it.each([false, true])("waits for the second occurrence of a repeated reveal (alternate art=%s)", async (withArt) => {
  const before = initial();
  const after = snapshotGameState(before);
  after.stateVersion = 2;
  after.players[1]!.handCount = 2;
  after.players[1]!.deckCount = 29;
  const expired = vi.fn<(expiry: GateExpiry) => void>();
  const stopObserving = observeGateExpiry(expired);
  const layout = anchors();
  const { result, rerender } = renderHook(
    ({ state, batches }: { state: GameState; batches: readonly ServerBatch[] }) =>
      useMatchCues({ state, batches, viewerSeat: 0, mulliganOpen: false, anchors: layout, onActionRejected() {} }),
    { initialProps: { state: before, batches: [] as readonly ServerBatch[] } },
  );
  try {
    await advance(0);
    rerender({
      state: after,
      batches: [
        singleServerBatch(
          [
            {
              kind: "cardRevealed",
              seat: 1,
              cardId: "ST1-03",
              sourceCardId: "ST1-01",
              ...(withArt ? { artId: "first" } : {}),
            },
            {
              kind: "cardRevealed",
              seat: 1,
              cardId: "ST1-03",
              sourceCardId: "ST1-02",
              ...(withArt ? { artId: "second" } : {}),
            },
            {
              kind: "cardsMoved",
              from: "deck",
              to: "hand",
              seat: 1,
              instanceIds: ["second-instance"],
              cardIds: ["ST1-03"],
              handAddition: "draw",
              ...(withArt ? { artIds: ["second"] } : {}),
            },
          ],
          2,
        ),
      ],
    });
    await advance(REVEAL_SHOWCASE_TOTAL_MS + 100);
    expect(result.current.revealShowcase?.sourceCardId).toBe("ST1-02");
    expect(result.current.drawFlights).toHaveLength(0);
    expect(result.current.heldHandArrivals.size).toBe(1);
    await advance(REVEAL_SHOWCASE_TOTAL_MS - 101);
    expect(result.current.drawFlights).toHaveLength(0);
    await advance(33);
    expect(result.current.revealShowcase).toBeNull();
    expect(result.current.drawFlights).toHaveLength(1);
    expect(result.current.drawFlights[0]!.presentation?.instanceId).toBe("second-instance");
    expect(result.current.heldHandArrivals.size).toBe(1);
    await advance(170);
    expect(result.current.heldHandArrivals.size).toBe(0);
    expect(expired).not.toHaveBeenCalled();
  } finally {
    stopObserving();
  }
});

it("serializes a private draw and a public draw across independent outer tracks", async () => {
  const before = initial();
  const after = snapshotGameState(before);
  after.stateVersion = 2;
  after.players[0]!.hand.push(card("private-new"));
  for (const player of after.players) {
    player.handCount = 2;
    player.deckCount = 29;
  }
  const layout = anchors();
  const { result, rerender } = renderHook(
    ({ state, batches }: { state: GameState; batches: readonly ServerBatch[] }) =>
      useMatchCues({
        state,
        batches,
        viewerSeat: 0,
        mulliganOpen: false,
        anchors: layout,
        onActionRejected() {},
      }),
    { initialProps: { state: before, batches: [] as readonly ServerBatch[] } },
  );
  await advance(0);
  rerender({
    state: after,
    batches: [
      singleServerBatch(
        [
          { kind: "cardsMoved", from: "deck", to: "hand", seat: 0, instanceIds: ["private-new"] },
          {
            kind: "cardsMoved",
            from: "deck",
            to: "hand",
            seat: 1,
            instanceIds: ["public-new"],
            cardIds: ["ST1-03"],
            handAddition: "draw",
          },
        ],
        2,
      ),
    ],
  });
  await advance(0);
  expect(result.current.drawFlights).toHaveLength(1);
  const first = result.current.drawFlights[0]!.key;
  expect(result.current.heldHandArrivals.size).toBe(2);
  await advance(322);
  expect(result.current.drawFlights).toHaveLength(1);
  expect(result.current.drawFlights[0]!.key).not.toBe(first);
  await advance(282);
  expect(result.current.drawFlights).toHaveLength(0);
  expect(result.current.heldHandArrivals.size).toBe(0);
});

it("releases both an active and a queued physical draw when the queue is cleared", async () => {
  const before = initial();
  const after = snapshotGameState(before);
  after.stateVersion = 2;
  after.players[0]!.hand.push(card("first"), card("second"));
  after.players[0]!.handCount = 3;
  after.players[0]!.deckCount = 28;
  const layout = anchors();
  let queue: AnimationQueue | undefined;
  const { result, rerender } = renderHook(
    ({ state, batches }: { state: GameState; batches: readonly ServerBatch[] }) =>
      useMatchCues({
        state,
        batches,
        viewerSeat: 0,
        mulliganOpen: false,
        anchors: layout,
        onActionRejected() {},
        devProbe: {
          onQueue: (controls) => {
            queue = controls.queue as AnimationQueue;
          },
        },
      }),
    { initialProps: { state: before, batches: [] as readonly ServerBatch[] } },
  );
  await advance(0);
  rerender({
    state: after,
    batches: [
      singleServerBatch(
        [{ kind: "cardsMoved", from: "deck", to: "hand", seat: 0, instanceIds: ["first", "second"] }],
        2,
      ),
    ],
  });
  await advance(0);
  expect(result.current.drawFlights).toHaveLength(1);
  expect(result.current.heldHandArrivals.size).toBe(2);
  act(() => queue!.clear());
  await advance(0);
  expect(result.current.drawFlights).toHaveLength(0);
  expect(result.current.heldHandArrivals.size).toBe(0);
});

it.each(["deck", "various"] as const)(
  "adds a revealed %s transfer directly to the hand after its matching showcase",
  async (from) => {
    const before = initial();
    const after = snapshotGameState(before);
    after.stateVersion = 2;

    after.players[1]!.handCount = 2;
    if (from === "deck") after.players[1]!.deckCount = 29;
    const layout = anchors();
    const { result, rerender } = renderHook(
      ({ state, batches }: { state: GameState; batches: readonly ServerBatch[] }) =>
        useMatchCues({ state, batches, viewerSeat: 0, mulliganOpen: false, anchors: layout, onActionRejected() {} }),
      { initialProps: { state: before, batches: [] as readonly ServerBatch[] } },
    );
    await advance(0);
    rerender({
      state: after,
      batches: [
        singleServerBatch(
          [
            { kind: "cardRevealed", seat: 1, cardId: "ST1-03" },
            {
              kind: "cardsMoved",
              from,
              to: "hand",
              seat: 1,
              instanceIds: ["searched"],
              cardIds: ["ST1-03"],
              handAddition: "transfer",
            },
          ],
          2,
        ),
      ],
    });
    await advance(0);
    const held = [...result.current.heldHandArrivals.values()][0]!;
    expect(held).toMatchObject({ entryOnly: true, fromDeck: from === "deck", instanceId: "searched" });
    const shown = presentedSeats({
      shownState: after,
      viewer: after.players[0]!,
      opponent: after.players[1]!,
      viewerSeat: 0,
      heldPhaseState: undefined,
      heldBlowState: undefined,
      heldSecurityEffectState: undefined,
      heldDrawState: undefined,
      heldBreedingState: undefined,
      heldDeletions: new Map(),
      heldTrashArrivals: new Map(),
      heldHandArrivals: result.current.heldHandArrivals,
      optimisticPlayedInstanceId: undefined,
      presentationPacing: "sequential",
    });
    expect(shown.shownHand!.map((entry) => entry.instanceId)).toEqual(["kept"]);
    expect(shown.shownOpponent).toMatchObject({ handCount: 1, deckCount: 30 });
    await advance(REVEAL_SHOWCASE_TOTAL_MS - 1);
    expect(result.current.heldHandArrivals.size).toBe(1);
    expect(result.current.drawFlights).toHaveLength(0);
    await advance(33);
    expect(result.current.revealShowcase).toBeNull();
    expect(result.current.heldHandArrivals.size).toBe(0);
    expect(result.current.drawFlights).toHaveLength(0);
  },
);

it.each([0, 1] as const)(
  "serializes a private search's hand entries without a deck presentation (seat=%s)",
  async (seat) => {
    const before = initial();
    const after = snapshotGameState(before);
    after.stateVersion = 2;
    after.players[seat]!.handCount = 3;
    after.players[seat]!.deckCount = 28;
    if (seat === 0) after.players[seat]!.hand.push(card("searched-first"), card("searched-second"));
    const layout = anchors();
    const { result, rerender } = renderHook(
      ({ state, batches }: { state: GameState; batches: readonly ServerBatch[] }) =>
        useMatchCues({ state, batches, viewerSeat: 0, mulliganOpen: false, anchors: layout, onActionRejected() {} }),
      { initialProps: { state: before, batches: [] as readonly ServerBatch[] } },
    );
    await advance(0);
    rerender({
      state: after,
      batches: [
        singleServerBatch(
          [
            {
              kind: "cardsMoved",
              from: "deck",
              to: "hand",
              seat,
              instanceIds: ["searched-first", "searched-second"],
              handAddition: "transfer",
            },
          ],
          2,
        ),
      ],
    });
    await advance(0);
    expect(result.current.heldHandArrivals.size).toBe(1);
    expect(result.current.drawFlights).toHaveLength(0);
    await advance(79);
    expect(result.current.heldHandArrivals.size).toBe(1);
    await advance(1);
    expect(result.current.heldHandArrivals.size).toBe(0);
    expect(result.current.drawFlights).toHaveLength(0);
  },
);

it("keeps a staged-then-played opponent card out of hand presentation even while paused", async () => {
  const before = initial();
  const after = snapshotGameState(before);
  after.stateVersion = 2;
  after.players[1]!.deckCount -= 1;
  const layout = anchors();
  let queue: AnimationQueue | undefined;
  const { result, rerender } = renderHook(
    ({ state, batches }: { state: GameState; batches: readonly ServerBatch[] }) =>
      useMatchCues({
        state,
        batches,
        viewerSeat: 0,
        mulliganOpen: false,
        anchors: layout,
        onActionRejected() {},
        devProbe: {
          onQueue: (controls) => {
            queue = controls.queue as AnimationQueue;
          },
        },
      }),
    { initialProps: { state: before, batches: [] as readonly ServerBatch[] } },
  );
  await advance(0);
  act(() => queue!.pause());
  rerender({
    state: after,
    batches: [
      singleServerBatch(
        [
          { kind: "cardsMoved", from: "deck", to: "hand", seat: 1, instanceIds: ["staged"], handAddition: "staging" },
          { kind: "cardPlayed", seat: 1, permanentId: "played", cardId: "ST1-03" },
        ],
        2,
      ),
    ],
  });
  await advance(0);
  expect(result.current.heldHandArrivals.size).toBe(0);
  expect(result.current.drawFlights).toHaveLength(0);
  const shown = presentedSeats({
    shownState: after,
    viewer: after.players[0]!,
    opponent: after.players[1]!,
    viewerSeat: 0,
    heldPhaseState: undefined,
    heldBlowState: undefined,
    heldSecurityEffectState: undefined,
    heldDrawState: undefined,
    heldBreedingState: undefined,
    heldDeletions: new Map(),
    heldTrashArrivals: new Map(),
    heldHandArrivals: result.current.heldHandArrivals,
    optimisticPlayedInstanceId: undefined,
    presentationPacing: "sequential",
  });
  expect(shown.shownOpponent.handCount).toBe(before.players[1]!.handCount);
  act(() => queue!.clear());
});

it("holds an incoming private hand card when its membership patches before the deck count and batch close", async () => {
  const before = initial();
  const incoming = snapshotGameState(before);
  incoming.players[0]!.hand.push(card("incoming"));
  let snapshots = [{ stateVersion: before.stateVersion, state: before }];
  let batches: readonly ServerBatch[] = [];
  const layout = anchors();
  const { result, rerender } = renderHook(
    ({ state }: { state: GameState }) =>
      useMatchCues({
        state,
        snapshots,
        batches,
        phaseEvents: batches.flatMap((batch) => batch.events),
        viewerSeat: 0,
        mulliganOpen: false,
        anchors: layout,
        onActionRejected() {},
      }),
    { initialProps: { state: before } },
  );
  await advance(0);
  rerender({ state: incoming });
  let closed = incoming;
  const shown = () =>
    presentedSeats({
      shownState: closed,
      viewer: closed.players[0]!,
      opponent: closed.players[1]!,
      viewerSeat: 0,
      heldPhaseState: undefined,
      heldBlowState: undefined,
      heldSecurityEffectState: undefined,
      heldDrawState: undefined,
      heldBreedingState: undefined,
      heldDeletions: new Map(),
      heldTrashArrivals: new Map(),
      heldHandArrivals: result.current.heldHandArrivals,
      optimisticPlayedInstanceId: undefined,
    });
  expect(shown().shownHand!.map((entry) => entry.instanceId)).toEqual(["kept"]);
  closed = snapshotGameState(incoming);
  closed.stateVersion = 2;
  closed.players[0]!.handCount = 2;
  closed.players[0]!.deckCount = 29;
  snapshots = [...snapshots, { stateVersion: 2, state: closed }];
  batches = [
    singleServerBatch([{ kind: "cardsMoved", from: "deck", to: "hand", seat: 0, instanceIds: ["incoming"] }], 2),
  ];
  rerender({ state: closed });
  await advance(8_000);
  expect(result.current.heldHandArrivals.size).toBe(0);
  expect(shown().shownHand!.map((entry) => entry.instanceId)).toEqual(["kept", "incoming"]);
});
