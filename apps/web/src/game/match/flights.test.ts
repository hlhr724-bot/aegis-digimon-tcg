// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAnimationQueue } from "../animationQueue";
import { Side } from "../side";
import { cueFlights } from "./flights";
import { createPresentationGate, waitForGate } from "./presentationGate";
import type { DrawFlight, DrawHandArrival, MatchCueAnchors } from "./types";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function flightSequence(draw?: DrawHandArrival) {
  const log: string[] = [];
  let flights: readonly DrawFlight[] = [];
  const queue = createAnimationQueue();
  const precedingStrip = createPresentationGate();
  const laterEffect = createPresentationGate();
  const node = document.createElement("div");
  node.getBoundingClientRect = () => new DOMRect(0, 0, 100, 100);
  const anchors: MatchCueAnchors = {
    board: { current: node },
    yourDeck: { current: node },
    oppDeck: { current: node },
    yourHandDock: { current: node },
    oppHandStrip: { current: node },
    yourSecurity: { current: node },
    oppSecurity: { current: node },
  };
  const { launchDrawFlight } = cueFlights({
    queue,
    anchors,
    viewerSeat: 0,
    presentationBatchRef: { current: { batchId: "draw-batch", stateVersion: 1 } },
    causingEffectGateRef: { current: null },
    securityGainKeyRef: { current: 0 },
    drawFlightKeyRef: { current: 0 },
    setSecurityFlights: () => {},
    setSecurityDealCounts: () => {},
    setDrawBursts: () => {},
    setHeldHandArrivals: () => {},
    setDrawFlights: (next) => {
      const updated = typeof next === "function" ? next(flights) : next;
      if (updated.length > flights.length) log.push("flight-start");
      if (updated.length < flights.length) log.push("flight-end");
      flights = updated;
    },
  });
  queue.enqueue({
    id: "stack-strip-peel-1",
    track: "stackStripPeel-host",
    side: Side.Opponent,
    async run(context) {
      await waitForGate(precedingStrip, context, 5000, "preceding-strip");
      log.push("preceding-strip-end");
    },
  });
  launchDrawFlight(Side.Opponent, false, 0, undefined, undefined, draw, 1);
  // A later clause waits for the earlier flight, as narrationStream does. Its peel
  // must not become a new prerequisite of that flight after the flight was queued.
  queue.enqueue({
    id: "later-effect",
    track: "narration",
    async run(context) {
      while (!context.cancelled && !context.skipping && queue.hasPendingStep((step) => step.id === "draw-flight-1"))
        await context.wait(16);
      log.push("later-effect");
      laterEffect.release();
    },
  });
  queue.enqueue({
    id: "stack-strip-peel-2",
    track: "stackStripPeel-host",
    side: Side.Opponent,
    async run(context) {
      await waitForGate(laterEffect, context, 5000, "later-strip");
      log.push("later-strip-end");
    },
  });
  return { queue, log, precedingStrip, laterEffect, flights: () => flights };
}

describe("draw flight source-peel ordering", () => {
  it.each([undefined, { stateVersion: 1, handCountAfter: 5, deckCountAfter: 45 } satisfies DrawHandArrival])(
    "waits for preceding peels without waiting for a later clause's peels (metadata=%j)",
    async (draw) => {
      const sequence = flightSequence(draw);
      await vi.advanceTimersByTimeAsync(32);
      expect(sequence.flights()).toHaveLength(0);
      expect(sequence.log).toEqual([]);

      sequence.precedingStrip.release();
      await vi.advanceTimersByTimeAsync(32);
      expect(sequence.flights()).toHaveLength(1);
      expect(sequence.log).toEqual(["preceding-strip-end", "flight-start"]);
      expect(sequence.laterEffect.open).toBe(false);

      await vi.advanceTimersByTimeAsync(1000);
      expect(sequence.log).toEqual([
        "preceding-strip-end",
        "flight-start",
        "flight-end",
        "later-effect",
        "later-strip-end",
      ]);
      expect(sequence.flights()).toHaveLength(0);
      expect(sequence.queue.isIdle()).toBe(true);
    },
  );

  it("fast-forwards the flight and both blocked peels without leaving pending cues", async () => {
    const sequence = flightSequence();
    await vi.advanceTimersByTimeAsync(32);
    expect(sequence.flights()).toHaveLength(0);

    sequence.queue.skip();
    await vi.advanceTimersByTimeAsync(32);
    expect(sequence.flights()).toHaveLength(0);
    expect(sequence.queue.isIdle()).toBe(true);
    expect(sequence.log).toContain("preceding-strip-end");
    expect(sequence.log).toContain("later-strip-end");
  });
});

it("flies public cards from trash under the host and from deck into trash", async () => {
  const board = document.createElement("div");
  const trash = document.createElement("div");
  const deck = document.createElement("div");
  trash.className = "game-utility-slot--you-trash";
  board.append(trash, deck);
  board.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
  trash.getBoundingClientRect = () => new DOMRect(600, 400, 60, 80);
  deck.getBoundingClientRect = () => new DOMRect(600, 200, 60, 80);
  let flights: readonly DrawFlight[] = [];
  const observed: DrawFlight[] = [];
  const queue = createAnimationQueue();
  const { flyPublicPileCard } = cueFlights({
    queue,
    anchors: {
      board: { current: board },
      yourDeck: { current: deck },
      oppDeck: { current: null },
      yourHandDock: { current: null },
      oppHandStrip: { current: null },
      yourSecurity: { current: null },
      oppSecurity: { current: null },
      permanentCenter: () => ({ x: 300, y: 300 }),
    },
    viewerSeat: 0,
    causingEffectGateRef: { current: null },
    securityGainKeyRef: { current: 0 },
    drawFlightKeyRef: { current: 0 },
    setSecurityFlights: () => {},
    setSecurityDealCounts: () => {},
    setDrawBursts: () => {},
    setHeldHandArrivals: () => {},
    setDrawFlights: (next) => {
      flights = typeof next === "function" ? next(flights) : next;
      observed.push(...flights);
    },
  });
  const context = { mode: "live" as const, cancelled: false, skipping: false, wait: async () => {} };
  await flyPublicPileCard({
    event: {
      kind: "cardsMoved",
      from: "trash",
      to: "battleArea",
      fromSeat: 0,
      placedUnder: { permanentId: "host" },
      instanceIds: ["source"],
      cardIds: ["BT15-031"],
    },
    index: 0,
    context,
  });
  await flyPublicPileCard({
    event: { kind: "cardsMoved", from: "deck", to: "trash", fromSeat: 0, instanceIds: ["milled"], cardIds: ["ST1-03"] },
    index: 0,
    context,
  });
  expect(observed).toMatchObject([
    { x: 630, y: 440, dx: -330, dy: -140, card: { cardId: "BT15-031" } },
    { x: 630, y: 240, dx: 0, dy: 200, card: { cardId: "ST1-03" } },
  ]);
  expect(flights).toEqual([]);
  queue.clear();
});
it.each([0, 1] as const)(
  "animates a public hand discard to its owner's trash after the clause, seat %s",
  async (seat) => {
    const board = document.createElement("div");
    const hand = document.createElement("div");
    const trash = document.createElement("div");
    trash.className = seat === 0 ? "game-utility-slot--you-trash" : "game-utility-slot--opp-trash";
    board.append(trash);
    board.getBoundingClientRect = () => new DOMRect(10, 20, 800, 600);
    hand.getBoundingClientRect = () => new DOMRect(200, 30, 100, 60);
    trash.getBoundingClientRect = () => new DOMRect(650, 200, 60, 84);
    const queue = createAnimationQueue();
    const cause = createPresentationGate();
    let flights: readonly DrawFlight[] = [];
    const { launchHandTrashFlight } = cueFlights({
      queue,
      viewerSeat: 0,
      anchors: {
        board: { current: board },
        yourHandDock: { current: hand },
        oppHandStrip: { current: hand },
        yourDeck: { current: null },
        oppDeck: { current: null },
        yourSecurity: { current: null },
        oppSecurity: { current: null },
      },
      causingEffectGateRef: { current: cause },
      securityGainKeyRef: { current: 0 },
      drawFlightKeyRef: { current: 0 },
      setSecurityFlights: () => {},
      setSecurityDealCounts: () => {},
      setDrawBursts: () => {},
      setHeldHandArrivals: () => {},
      setDrawFlights: (next) => {
        flights = typeof next === "function" ? next(flights) : next;
      },
    });
    launchHandTrashFlight(seat, { cardId: "BT1-009", artId: "alternate" });
    await vi.advanceTimersByTimeAsync(100);
    expect(flights).toEqual([]);
    cause.release();
    await vi.advanceTimersByTimeAsync(32);
    expect(flights).toEqual([
      expect.objectContaining({
        handTrash: true,
        card: { cardId: "BT1-009", artId: "alternate" },
        x: 240,
        y: 40,
        dx: 430,
        dy: 182,
      }),
    ]);
    await vi.runAllTimersAsync();
    expect(flights).toEqual([]);
    expect(queue.isIdle()).toBe(true);
  },
);
