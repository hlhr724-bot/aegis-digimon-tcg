import { EventEmitter } from "node:events";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CloseCode, LocalPresence, matchMaker, type Client } from "colyseus";
import { MATCH_EXPIRED_CLOSE_CODE } from "@aegis/shared";
import type { AccountStore } from "#api/accounts/AccountStore";
import type { ConnectionDropStore } from "#api/connections/ConnectionDropStore";
import { AegisRoom } from "#api/rooms/AegisRoom";

const EMPTY_DECK = { mainDeck: [], eggDeck: [] };
const ROOM_NAME = "server-closure";

type DropRecorder = Pick<ConnectionDropStore, "recordDrop" | "resolveDrop" | "recordClientReport">;

type RoomInternals = {
  accountByClient: Map<string, string>;
  handleIntent: (client: Client, intent: { type: string }) => void;
  resetAutoDisposeTimeout: (seconds: number) => void;
};

class RecordingRoom extends AegisRoom {
  readonly drops: DropRecorder = {
    recordDrop: vi.fn<DropRecorder["recordDrop"]>(async () => 7),
    resolveDrop: vi.fn<DropRecorder["resolveDrop"]>(async () => {}),
    recordClientReport: vi.fn<DropRecorder["recordClientReport"]>(async () => {}),
  };

  readonly recordRecentMatch = vi.fn<AccountStore["recordRecentMatch"]>(async () => {});

  protected override connectionDrops(): DropRecorder {
    return this.drops;
  }

  protected override accounts(): AccountStore {
    return {
      recordRecentMatch: this.recordRecentMatch,
      pool: { query: vi.fn<() => Promise<void>>(async () => {}) },
    } as unknown as AccountStore;
  }
}

function createSocketClient(sessionId: string): Client {
  const socket = new EventEmitter() as EventEmitter & { onleave?: () => void };
  socket.onleave = vi.fn<() => void>();
  socket.on("close", socket.onleave);
  return {
    sessionId,
    reconnectionToken: `token-${sessionId}`,
    ref: socket,
    send: vi.fn<Client["send"]>(),
    leave: vi.fn<Client["leave"]>(),
    view: undefined,
  } as unknown as Client;
}

async function createStartedMatch() {
  const listing = await matchMaker.createRoom(ROOM_NAME, { seed: 1 });
  const room = matchMaker.getLocalRoomById(listing.roomId) as RecordingRoom;
  room.broadcast = vi.fn<AegisRoom["broadcast"]>(() => true);
  room.broadcastPatch = vi.fn<AegisRoom["broadcastPatch"]>(() => false);
  const internals = room as unknown as RoomInternals;
  const first = createSocketClient("session-a");
  const second = createSocketClient("session-b");
  internals.accountByClient.set(first.sessionId, "account-a");
  internals.accountByClient.set(second.sessionId, "account-b");
  room.clients.push(first);
  room.onJoin(first, { displayName: "Agumon", deck: EMPTY_DECK });
  room.clients.push(second);
  room.onJoin(second, { displayName: "Gabumon", deck: EMPTY_DECK });
  internals.handleIntent(first, { type: "ready" });
  internals.handleIntent(second, { type: "ready" });
  internals.resetAutoDisposeTimeout(0);
  await flushPromises();
  return { room, first, second };
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeAll(async () => {
  await matchMaker.setup(new LocalPresence());
  matchMaker.defineRoomType(ROOM_NAME, RecordingRoom);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await matchMaker.gracefullyShutdown();
});

describe("a live match the server closes", () => {
  it("records no result and no connection drop for either player", async () => {
    const { room } = await createStartedMatch();

    await room.disconnect(MATCH_EXPIRED_CLOSE_CODE);
    await flushPromises();

    expect(room.state.gameOver).toBe(false);
    expect(room.recordRecentMatch).not.toHaveBeenCalled();
    expect(room.drops.recordDrop).not.toHaveBeenCalled();
  });

  it("still gives the opponent the win when a dropped player's reconnect window expires", async () => {
    const { room, second } = await createStartedMatch();
    room.allowReconnection = vi.fn<() => Promise<Client>>(async () => {
      throw new Error("reconnect grace elapsed");
    }) as unknown as AegisRoom["allowReconnection"];

    await room.onLeave(second, CloseCode.ABNORMAL_CLOSURE);
    await flushPromises();

    expect(room.state.gameOver).toBe(true);
    expect(room.recordRecentMatch).toHaveBeenCalledWith(
      "account-b",
      room.roomId,
      expect.objectContaining({ result: "loss" }),
    );
    expect(room.recordRecentMatch).toHaveBeenCalledWith(
      "account-a",
      room.roomId,
      expect.objectContaining({ result: "win" }),
    );
  });
});
