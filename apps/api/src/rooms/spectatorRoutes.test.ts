import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { matchMaker } from "colyseus";
import { installSpectatorRoutes } from "./spectatorRoutes.js";
import { roomCodeDirectory, setRoomCodeDirectory } from "./AegisRoom.js";

vi.mock("colyseus", async (importOriginal) => ({
  ...(await importOriginal<typeof import("colyseus")>()),
  matchMaker: { query: vi.fn(), remoteRoomCall: vi.fn(), reserveSeatFor: vi.fn() },
}));
const originalDirectory = roomCodeDirectory();
afterEach(() => {
  vi.clearAllMocks();
  setRoomCodeDirectory(originalDirectory);
});

async function request(body: unknown) {
  const app = express();
  app.use(express.json());
  installSpectatorRoutes(app);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/spectate/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function available(name = "aegis") {
  setRoomCodeDirectory({ resolve: vi.fn(async () => "match-id"), claim: vi.fn(), release: vi.fn() });
  vi.mocked(matchMaker.query).mockResolvedValue([{ roomId: "match-id", name, locked: true, clients: 2 }] as never);
  vi.mocked(matchMaker.remoteRoomCall).mockResolvedValue({
    roomId: "match-id",
    players: ["A", "B"],
    spectators: 0,
  } as never);
  vi.mocked(matchMaker.reserveSeatFor).mockResolvedValue({
    sessionId: "spectator-session",
    roomId: "match-id",
  } as never);
}

describe("spectator admission", () => {
  it("requires a code, including for public matches", async () => {
    expect((await request({ roomId: "match-id" })).status).toBe(400);
    expect((await request({ roomCode: 42 })).status).toBe(400);
    expect(matchMaker.reserveSeatFor).not.toHaveBeenCalled();
  });
  for (const name of ["aegis", "aegis_beta", "aegis_unlimited", "aegis_private"]) {
    it(`reserves a code-authorized observer in a locked ${name} match`, async () => {
      available(name);
      const response = await request({
        roomCode: "abcdef",
        displayName: "Watcher",
        authTicket: "account-ticket",
        spectator: false,
        ranked: true,
        deck: { mainDeck: ["forged"] },
      });
      expect(response.status).toBe(200);
      expect(response.body.sessionId).toBe("spectator-session");
      expect(matchMaker.remoteRoomCall).toHaveBeenCalledWith("match-id", "spectatorInfo", ["ABCDEF"]);
      expect(matchMaker.reserveSeatFor).toHaveBeenCalledWith(expect.anything(), {
        spectator: true,
        roomCode: "ABCDEF",
        displayName: "Watcher",
        authTicket: "account-ticket",
        deck: { mainDeck: [], eggDeck: [] },
      });
    });
  }
  it("does not admit bot, ranked or tournament observers", async () => {
    for (const name of ["aegis_bot", "aegis_ranked", "aegis_tournament"]) {
      available(name);
      expect((await request({ roomCode: "ABCDEF" })).status).toBe(404);
    }
    expect(matchMaker.reserveSeatFor).not.toHaveBeenCalled();
  });
  it("rejects a wrong code, finished match, or full observer capacity", async () => {
    available();
    vi.mocked(matchMaker.remoteRoomCall).mockResolvedValue(null as never);
    expect((await request({ roomCode: "ABCDEF" })).status).toBe(404);
    expect(matchMaker.reserveSeatFor).not.toHaveBeenCalled();
  });
  it("handles a room disappearing between validation and reservation", async () => {
    available();
    vi.mocked(matchMaker.reserveSeatFor).mockRejectedValue(new Error("room disposed"));
    expect((await request({ roomCode: "ABCDEF" })).status).toBe(409);
  });
});

async function withLiveServer(now: () => number, run: (list: (query?: string) => Promise<Response>) => Promise<void>) {
  const app = express();
  installSpectatorRoutes(app, { now });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/spectate/live`;
    await run((query = "") => fetch(`${base}${query}`));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function codes(response: Response) {
  const page = (await response.json()) as { matches: Array<{ spectatorCode: string }>; total: number };
  return { codes: page.matches.map((match) => match.spectatorCode), total: page.total };
}

function liveListing(name: string, spectatorCode: string, spectators = 0, startedAt = 1) {
  return {
    name,
    metadata: { live: { spectatorCode, players: ["A", "B"], format: "standard", startedAt, spectators } },
  };
}

describe("live match list", () => {
  it("lists only published casual matches below observer capacity, busiest first", async () => {
    vi.mocked(matchMaker.query).mockResolvedValue([
      liveListing("aegis", "QUIETX", 1),
      { name: "aegis", metadata: { unlimited: false } },
      liveListing("aegis_beta", "BUSYXX", 9),
      liveListing("aegis_private", "PRIVAT", 5),
      liveListing("aegis_ranked", "RANKED", 5),
      liveListing("aegis_unlimited", "FULLXX", 20),
    ] as never);
    await withLiveServer(Date.now, async (list) => {
      const response = await list();
      expect(response.status).toBe(200);
      expect(await codes(response)).toEqual({ codes: ["BUSYXX", "QUIETX"], total: 2 });
    });
    expect(matchMaker.query).toHaveBeenCalledTimes(1);
  });

  it("pages with offset and limit and rejects out-of-range values", async () => {
    vi.mocked(matchMaker.query).mockResolvedValue(
      Array.from({ length: 12 }, (_, index) =>
        liveListing("aegis", `CODE${String(index).padStart(2, "0")}`, 12 - index),
      ) as never,
    );
    await withLiveServer(Date.now, async (list) => {
      expect(await codes(await list())).toMatchObject({ total: 12 });
      expect((await codes(await list())).codes).toHaveLength(10);
      expect(await codes(await list("?offset=10&limit=5"))).toEqual({ codes: ["CODE10", "CODE11"], total: 12 });
      for (const query of ["?limit=0", "?limit=51", "?offset=-1", "?offset=abc", "?limit=2.5"]) {
        expect((await list(query)).status).toBe(400);
      }
    });
  });

  it("reuses one room query for five seconds, then refreshes", async () => {
    let now = 1_000;
    vi.mocked(matchMaker.query).mockResolvedValue([liveListing("aegis", "FIRSTX")] as never);
    await withLiveServer(
      () => now,
      async (list) => {
        await Promise.all([list(), list(), list()]);
        now += 4_999;
        await list();
        expect(matchMaker.query).toHaveBeenCalledTimes(1);
        vi.mocked(matchMaker.query).mockResolvedValue([liveListing("aegis", "SECOND")] as never);
        now += 1;
        expect((await codes(await list())).codes).toEqual(["SECOND"]);
        expect(matchMaker.query).toHaveBeenCalledTimes(2);
      },
    );
  });

  it("retries at once after a failed room query", async () => {
    vi.mocked(matchMaker.query).mockRejectedValueOnce(new Error("redis down"));
    vi.mocked(matchMaker.query).mockResolvedValueOnce([liveListing("aegis", "BACKUP")] as never);
    await withLiveServer(
      () => 1_000,
      async (list) => {
        expect((await list()).status).toBe(503);
        expect((await codes(await list())).codes).toEqual(["BACKUP"]);
      },
    );
  });
});
