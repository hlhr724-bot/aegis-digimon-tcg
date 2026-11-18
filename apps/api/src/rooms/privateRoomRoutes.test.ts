import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorCode, LocalPresence, Room, ServerError, matchMaker } from "colyseus";
import { ROOM_TYPE_PRIVATE } from "@aegis/shared";
import { installPrivateRoomRoutes } from "./privateRoomRoutes.js";
import { roomCodeDirectory, setRoomCodeDirectory } from "./AegisRoom.js";
import { createLocalRoomCodeDirectory } from "../cluster/roomCodes.js";

vi.mock("colyseus", async (importOriginal) => {
  const original = await importOriginal<typeof import("colyseus")>();
  return {
    ...original,
    matchMaker: {
      query: vi.fn<typeof original.matchMaker.query>(),
      remoteRoomCall: vi.fn<typeof original.matchMaker.remoteRoomCall>(),
    },
  };
});

const originalDirectory = roomCodeDirectory();
afterEach(() => {
  vi.resetAllMocks();
  setRoomCodeDirectory(originalDirectory);
});

async function request(body: unknown) {
  const app = express();
  app.use(express.json());
  installPrivateRoomRoutes(app);
  const errors: unknown[] = [];
  app.use(((error, _req, res, _next) => {
    errors.push(error);
    res.status(500).json({ error: "internal server error" });
  }) as express.ErrorRequestHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/room/lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown>, errors };
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

function available({
  unlimited = true,
  clients = 1,
  locked = false,
  name = ROOM_TYPE_PRIVATE,
}: { unlimited?: boolean; clients?: number; locked?: boolean; name?: string } = {}) {
  const directory = createLocalRoomCodeDirectory();
  directory.claim("ABC234", "old-room");
  setRoomCodeDirectory(directory);
  vi.mocked(matchMaker.query).mockResolvedValue([{ roomId: "old-room", name, clients, locked }] as never);
  vi.mocked(matchMaker.remoteRoomCall).mockResolvedValue({ unlimited } as never);
  return directory;
}

function unavailableRpc() {
  return new ServerError(
    ErrorCode.MATCHMAKE_UNHANDLED,
    'remote room (old-room) timed out, requesting "privateRoomInfo with args []". (2000ms exceeded)',
  );
}

describe("private room lookup over HTTP", () => {
  it("returns 404 when a real room is disposed after the listing lookup and before the rules RPC", async () => {
    const real = await vi.importActual<typeof import("colyseus")>("colyseus");
    class PrivateRoom extends Room {
      override onCreate() {
        this.autoDispose = false;
      }
      privateRoomInfo() {
        return { unlimited: true };
      }
    }
    await real.matchMaker.setup(new LocalPresence());
    real.matchMaker.defineRoomType(ROOM_TYPE_PRIVATE, PrivateRoom);
    try {
      const listing = await real.matchMaker.createRoom(ROOM_TYPE_PRIVATE, {});
      const directory = createLocalRoomCodeDirectory();
      directory.claim("ABC234", listing.roomId);
      setRoomCodeDirectory(directory);
      vi.mocked(matchMaker.query).mockImplementation(async (conditions) => real.matchMaker.query(conditions));
      vi.mocked(matchMaker.query).mockImplementationOnce(async (conditions) => {
        const found = await real.matchMaker.query(conditions);
        expect(found).toHaveLength(1);
        await real.matchMaker.getLocalRoomById(listing.roomId)!.disconnect();
        return found;
      });
      // Exercise the installed Colyseus IPC failure with a shorter test-only timeout.
      vi.mocked(matchMaker.remoteRoomCall).mockImplementation((roomId, method, args) =>
        real.matchMaker.remoteRoomCall(roomId, method, args, 20),
      );
      const response = await request({ roomCode: "abc234" });
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "room not available" });
      expect(response.errors).toEqual([]);
      expect(await directory.resolve("ABC234")).toBeUndefined();
    } finally {
      await real.matchMaker.gracefullyShutdown();
    }
  });

  it.each([false, true])("returns the host's fixed Unlimited mode (%s) and normalizes the code", async (unlimited) => {
    available({ unlimited });
    expect(await request({ roomCode: "abc234", unlimited: !unlimited })).toMatchObject({
      status: 200,
      body: { roomId: "old-room", unlimited },
      errors: [],
    });
    expect(matchMaker.remoteRoomCall).toHaveBeenCalledWith("old-room", "privateRoomInfo", []);
  });

  it("shows a guest the host's turn order without the host's account", async () => {
    available();
    vi.mocked(matchMaker.remoteRoomCall).mockResolvedValue({
      unlimited: false,
      turnOrder: "hostFirst",
      hostAccountId: "host-account",
      waiting: true,
    } as never);
    expect((await request({ roomCode: "ABC234" })).body).toEqual({
      roomId: "old-room",
      unlimited: false,
      turnOrder: "hostFirst",
    });
  });

  it("requires a room code", async () => {
    expect((await request({})).status).toBe(400);
    expect(matchMaker.query).not.toHaveBeenCalled();
  });

  it("returns the existing 404 for an unknown code", async () => {
    setRoomCodeDirectory(createLocalRoomCodeDirectory());
    expect(await request({ roomCode: "ABC234" })).toMatchObject({ status: 404, body: { error: "room not found" } });
    expect(matchMaker.query).not.toHaveBeenCalled();
  });

  it("releases a stale mapping when the first listing lookup is empty", async () => {
    const directory = available();
    vi.mocked(matchMaker.query).mockResolvedValue([]);
    expect((await request({ roomCode: "ABC234" })).status).toBe(404);
    expect(await directory.resolve("ABC234")).toBeUndefined();
    expect(matchMaker.remoteRoomCall).not.toHaveBeenCalled();
  });

  it.each([{ clients: 2 }, { locked: true }, { name: "aegis_bot" }])(
    "preserves the code for an ineligible room (%j)",
    async (options) => {
      const directory = available(options);
      expect((await request({ roomCode: "ABC234" })).status).toBe(404);
      expect(await directory.resolve("ABC234")).toBe("old-room");
      expect(matchMaker.remoteRoomCall).not.toHaveBeenCalled();
    },
  );

  it("preserves a successor room's code claim while reporting an expired predecessor", async () => {
    const directory = available();
    vi.mocked(matchMaker.query).mockResolvedValueOnce([
      { name: ROOM_TYPE_PRIVATE, clients: 1, locked: false },
    ] as never);
    vi.mocked(matchMaker.query).mockResolvedValue([]);
    vi.mocked(matchMaker.remoteRoomCall).mockImplementation(async () => {
      directory.claim("ABC234", "new-room");
      throw unavailableRpc();
    });
    expect(await request({ roomCode: "ABC234" })).toMatchObject({ status: 404, body: { error: "room not available" } });
    expect(await directory.resolve("ABC234")).toBe("new-room");
  });

  it("retains a timeout from a still-listed room as a server error", async () => {
    const directory = available();
    const error = unavailableRpc();
    vi.mocked(matchMaker.remoteRoomCall).mockRejectedValue(error);
    expect(await request({ roomCode: "ABC234" })).toMatchObject({ status: 500, errors: [error] });
    expect(await directory.resolve("ABC234")).toBe("old-room");
  });

  it.each([new Error("rules failed"), new ServerError(ErrorCode.MATCHMAKE_UNHANDLED, "unexpected RPC failure")])(
    "retains an unexpected RPC failure as a server error (%s)",
    async (error) => {
      const directory = available();
      vi.mocked(matchMaker.query).mockResolvedValueOnce([
        { name: ROOM_TYPE_PRIVATE, clients: 1, locked: false },
      ] as never);
      vi.mocked(matchMaker.query).mockResolvedValue([]);
      vi.mocked(matchMaker.remoteRoomCall).mockRejectedValue(error);
      expect(await request({ roomCode: "ABC234" })).toMatchObject({ status: 500, errors: [error] });
      expect(await directory.resolve("ABC234")).toBe("old-room");
    },
  );

  it("retains a listing failure during expiry confirmation as a server error", async () => {
    const directory = available();
    const error = new Error("driver unavailable");
    vi.mocked(matchMaker.query).mockResolvedValueOnce([
      { name: ROOM_TYPE_PRIVATE, clients: 1, locked: false },
    ] as never);
    vi.mocked(matchMaker.query).mockRejectedValue(error);
    vi.mocked(matchMaker.remoteRoomCall).mockRejectedValue(unavailableRpc());
    expect(await request({ roomCode: "ABC234" })).toMatchObject({ status: 500, errors: [error] });
    expect(await directory.resolve("ABC234")).toBe("old-room");
  });
});
