import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { matchMaker } from "colyseus";
import { roomRegistry, type AegisRoom } from "#api/rooms/AegisRoom";
import { installBotRoutes } from "#api/rooms/installBotRoutes";

vi.mock("colyseus", async (original) => {
  const actual = await original<typeof import("colyseus")>();
  return {
    ...actual,
    matchMaker: {
      ...actual.matchMaker,
      query: vi.fn<typeof actual.matchMaker.query>(),
      remoteRoomCall: vi.fn<typeof actual.matchMaker.remoteRoomCall>(),
    },
  };
});

let close: (() => Promise<void>) | undefined;
let endpoint: string;

beforeEach(async () => {
  const app = express();
  app.use(express.json());
  installBotRoutes(app);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/bot/join`;
  close = () => new Promise((resolve) => server.close(() => resolve()));
  vi.mocked(matchMaker.query).mockResolvedValue([]);
});

afterEach(async () => {
  await close?.();
  roomRegistry.delete("local-room");
  vi.resetAllMocks();
});

async function request(body: unknown): Promise<Response> {
  return fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("authorized bot joins", () => {
  it.each([undefined, "", 123, {}, []])(
    "refuses absent or malformed credentials without touching the matchmaker: %j",
    async (reconnectionToken) => {
      const response = await request({ roomId: "local-room", reconnectionToken });
      expect(response.status).toBe(403);
      expect(matchMaker.query).not.toHaveBeenCalled();
      expect(matchMaker.remoteRoomCall).not.toHaveBeenCalled();
    },
  );

  it.each([200, 403, 409])("propagates authorization and eligibility from the local owner: %i", async (status) => {
    const requestBot = vi.fn<AegisRoom["requestBot"]>(() => status);
    roomRegistry.set("local-room", { requestBot } as unknown as AegisRoom);
    const response = await request({
      roomId: "local-room",
      reconnectionToken: "local-room:secret",
      botDeckId: "chosen-deck",
    });
    expect(response.status).toBe(status);
    expect(requestBot).toHaveBeenCalledWith({ reconnectionToken: "local-room:secret", botDeckId: "chosen-deck" });
    expect(matchMaker.remoteRoomCall).not.toHaveBeenCalled();
  });

  it.each([200, 403, 409])("checks the credential on the owning process of a remote room: %i", async (status) => {
    vi.mocked(matchMaker.query).mockResolvedValue([{ roomId: "remote-room" }] as Awaited<
      ReturnType<typeof matchMaker.query>
    >);
    vi.mocked(matchMaker.remoteRoomCall).mockResolvedValue(status);
    const response = await request({ roomId: "remote-room", reconnectionToken: "remote-room:secret" });
    expect(response.status).toBe(status);
    expect(matchMaker.remoteRoomCall).toHaveBeenCalledWith("remote-room", "requestBot", [
      { reconnectionToken: "remote-room:secret", botDeckId: undefined },
    ]);
  });

  it("keeps credentials out of responses when a remote call fails", async () => {
    vi.mocked(matchMaker.query).mockResolvedValue([{ roomId: "remote-room" }] as Awaited<
      ReturnType<typeof matchMaker.query>
    >);
    vi.mocked(matchMaker.remoteRoomCall).mockRejectedValue(
      new Error("RPC failed with remote-room:secret in arguments"),
    );
    const response = await request({ roomId: "remote-room", reconnectionToken: "remote-room:secret" });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "room_unavailable" });
  });

  it("returns not found without calling a remote method when the room is gone", async () => {
    expect((await request({ roomId: "gone", reconnectionToken: "gone:secret" })).status).toBe(404);
    expect(matchMaker.remoteRoomCall).not.toHaveBeenCalled();
  });

  it.each([null, {}, { roomId: {} }, { roomId: "room", reconnectionToken: "secret", botDeckId: {} }])(
    "rejects malformed room and deck input: %j",
    async (body) => {
      expect((await request(body)).status).toBe(400);
      expect(matchMaker.remoteRoomCall).not.toHaveBeenCalled();
    },
  );
});

describe("bot difficulty and style boundary", () => {
  it("forwards selected settings to the room owner", async () => {
    const requestBot = vi.fn<AegisRoom["requestBot"]>(() => 200);
    roomRegistry.set("local-room", { requestBot } as unknown as AegisRoom);
    const response = await request({
      roomId: "local-room",
      reconnectionToken: "local-room:secret",
      botDifficulty: "beginner",
      botStyle: "defensive",
    });
    expect(response.status).toBe(200);
    expect(requestBot).toHaveBeenCalledWith({
      reconnectionToken: "local-room:secret",
      botDeckId: undefined,
      botDifficulty: "beginner",
      botStyle: "defensive",
    });
  });

  it.each(["constructor", "__proto__", "toString", "unknown", null, 1, {}, []])(
    "rejects invalid settings %j",
    async (value) => {
      for (const field of ["botDifficulty", "botStyle"]) {
        const response = await request({
          roomId: "local-room",
          reconnectionToken: "local-room:secret",
          [field]: value,
        });
        expect(response.status).toBe(400);
      }
      expect(matchMaker.query).not.toHaveBeenCalled();
      expect(matchMaker.remoteRoomCall).not.toHaveBeenCalled();
    },
  );
});
