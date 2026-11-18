import type { Client } from "colyseus";
import type { Seat } from "@aegis/shared";
import { PrivateTurnOrder } from "@aegis/shared/protocol/PrivateTurnOrder";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AegisRoom } from "#api/rooms/AegisRoom";
import { CasualSeries } from "#api/rooms/series/CasualSeries";
import { addLogSink } from "#api/logger";
import { BLUE_DECK, RED_DECK } from "#api/engine/testDecks";
import type { GameEngine } from "#api/engine/GameEngine";

const SEED_DRAWING_GUEST_FIRST = 5;
const SEED_DRAWING_HOST_FIRST = 4;

type Internals = {
  engine: GameEngine;
  handleIntent(client: Client, intent: { type: "ready" }): void;
};

let lines: string[] = [];
let stopCapture: () => void = () => {};
const rooms: AegisRoom[] = [];

beforeEach(() => {
  lines = [];
  stopCapture = addLogSink((line) => lines.push(line));
});

afterEach(() => {
  stopCapture();
  for (const room of rooms.splice(0)) {
    room.onDispose();
    room.clock.stop();
  }
  vi.restoreAllMocks();
});

function makeRoom(options: Parameters<AegisRoom["onCreate"]>[0]): AegisRoom {
  const room = new AegisRoom();
  room.lock = vi.fn<() => Promise<void>>(async () => {});
  room.unlock = vi.fn<() => Promise<void>>(async () => {});
  room.setMatchmaking = vi.fn<() => Promise<void>>(async () => {});
  room.broadcast = vi.fn<() => boolean>(() => true) as AegisRoom["broadcast"];
  void room.onCreate(options);
  rooms.push(room);
  return room;
}

function recordedFirstSeat(room: AegisRoom): unknown {
  const header = lines
    .map((line) => JSON.parse(line) as { matchId?: string; data: [string, Record<string, unknown>] })
    .find((line) => line.matchId === room.state.matchLogId && line.data[0] === "replay.header");
  expect(header).toBeDefined();
  return header!.data[1].firstSeat;
}

function join(room: AegisRoom, sessionId: string, deck: typeof RED_DECK): Client {
  const client = { sessionId, send: vi.fn<() => void>(), view: undefined } as unknown as Client;
  room.clients.push(client);
  room.onJoin(client, { displayName: sessionId, deck });
  return client;
}

async function startMatch(room: AegisRoom): Promise<Seat> {
  const clients = [join(room, "host", RED_DECK), join(room, "guest", BLUE_DECK)];
  const internals = room as unknown as Internals;
  for (const client of clients) internals.handleIntent(client, { type: "ready" });
  await vi.waitFor(() => expect(room.state.pendingDecision?.kind).toBe("mulligan"));
  return room.state.turnSeat as Seat;
}

describe("private room turn order", () => {
  it("gives the host the first turn and records it for the replay", async () => {
    const room = makeRoom({
      seed: SEED_DRAWING_GUEST_FIRST,
      private: true,
      turnOrder: PrivateTurnOrder.HOST_FIRST.value,
    });

    expect(room.privateRoomInfo().turnOrder).toBe(PrivateTurnOrder.HOST_FIRST.value);
    expect(recordedFirstSeat(room)).toBe(0);
    expect(await startMatch(room)).toBe(0);
    expect(room.state.players[0]!.displayName).toBe("host");
  });

  it("gives the guest the first turn when the host goes second", async () => {
    const room = makeRoom({
      seed: SEED_DRAWING_HOST_FIRST,
      private: true,
      turnOrder: PrivateTurnOrder.HOST_SECOND.value,
    });

    expect(room.privateRoomInfo().turnOrder).toBe(PrivateTurnOrder.HOST_SECOND.value);
    expect(recordedFirstSeat(room)).toBe(1);
    expect(await startMatch(room)).toBe(1);
  });

  it.each([
    [SEED_DRAWING_GUEST_FIRST, 1],
    [SEED_DRAWING_HOST_FIRST, 0],
  ] as const)("keeps the seeded draw when the order is random (seed %i)", async (seed, drawnSeat) => {
    const room = makeRoom({ seed, private: true, turnOrder: PrivateTurnOrder.RANDOM.value });

    expect(room.privateRoomInfo().turnOrder).toBe(PrivateTurnOrder.RANDOM.value);
    expect(recordedFirstSeat(room)).toBeUndefined();
    expect(await startMatch(room)).toBe(drawnSeat);
  });

  it.each([undefined, "hostThird", "constructor", "HOST_FIRST", 0, { value: "hostFirst" }])(
    "falls back to random for the unknown value %j",
    (turnOrder) => {
      const room = makeRoom({ seed: SEED_DRAWING_GUEST_FIRST, private: true, turnOrder });

      expect(room.privateRoomInfo().turnOrder).toBe(PrivateTurnOrder.RANDOM.value);
      expect(recordedFirstSeat(room)).toBeUndefined();
      expect((room as unknown as Internals).engine.hooks.firstSeat).toBeUndefined();
    },
  );

  it.each([
    ["public", {}],
    ["ranked", { rankedRoom: true }],
    ["tournament", { tournamentRoom: true }],
    ["bot", { botRoom: true }],
    ["private manual", { private: true, manualRoom: true }],
  ] as const)("ignores a crafted turn order in a %s room", async (_name, roomType) => {
    const room = makeRoom({
      seed: SEED_DRAWING_GUEST_FIRST,
      ...roomType,
      turnOrder: PrivateTurnOrder.HOST_FIRST.value,
    });

    expect(room.privateRoomInfo().turnOrder).toBe(PrivateTurnOrder.RANDOM.value);
    expect(recordedFirstSeat(room)).toBeUndefined();
    expect((room as unknown as Internals).engine.hooks.firstSeat).toBeUndefined();
  });

  it("applies the host's choice to game 1 of a best-of-three", async () => {
    const room = makeRoom({
      seed: SEED_DRAWING_GUEST_FIRST,
      private: true,
      bestOf: 3,
      turnOrder: PrivateTurnOrder.HOST_FIRST.value,
    });

    expect(room.state.series.bestOf).toBe(3);
    expect(recordedFirstSeat(room)).toBe(0);
    expect(await startMatch(room)).toBe(0);
  });

  it("lets the series decide the first seat of a later game", () => {
    vi.spyOn(CasualSeries, "begin").mockReturnValue({
      fixedFirstSeat: 1,
      dispose: () => {},
    } as unknown as CasualSeries);
    const room = makeRoom({
      seed: SEED_DRAWING_HOST_FIRST,
      private: true,
      bestOf: 3,
      turnOrder: PrivateTurnOrder.HOST_FIRST.value,
    });

    expect(recordedFirstSeat(room)).toBe(1);
    expect((room as unknown as Internals).engine.hooks.firstSeat).toBe(1);
  });
});
