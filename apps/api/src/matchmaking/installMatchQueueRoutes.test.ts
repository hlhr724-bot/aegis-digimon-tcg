import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { matchMaker } from "colyseus";
import type { MatchQueueCounts } from "@aegis/shared/matchmaking/MatchQueueCounts";
import { installMatchQueueRoutes } from "#api/matchmaking/installMatchQueueRoutes";
import type { RankedSearcherCount } from "#api/ranked/countRankedSearchers";

vi.mock("colyseus", async (importOriginal) => ({
  ...(await importOriginal<typeof import("colyseus")>()),
  matchMaker: { query: vi.fn<typeof import("colyseus").matchMaker.query>() },
}));

afterEach(() => {
  vi.clearAllMocks();
});

type Options = Omit<Parameters<typeof installMatchQueueRoutes>[0], "app">;

async function withServer<T>(options: Options, run: (get: () => Promise<Response>) => Promise<T>): Promise<T> {
  const app = express();
  installMatchQueueRoutes({ app, ...options });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/matchmaking/queues`;
  try {
    return await run(() => fetch(url));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function readCounts(options: Options = {}): Promise<MatchQueueCounts> {
  return withServer(options, async (get) => (await get()).json() as Promise<MatchQueueCounts>);
}

function waitingRoom({ metadata, ...overrides }: Record<string, unknown> = {}) {
  return {
    roomId: crypto.randomUUID(),
    name: "aegis",
    locked: false,
    private: false,
    clients: 1,
    createdAt: new Date(0),
    ...overrides,
    metadata: {
      format: "standard",
      matchTimer: true,
      bestOf: 1,
      allowRollback: false,
      ...(metadata as Record<string, unknown> | undefined),
    },
  };
}

describe("matchmaking queue counts", () => {
  it("counts each waiting public room as one searching player in its queue settings", async () => {
    vi.mocked(matchMaker.query).mockResolvedValue([
      waitingRoom(),
      waitingRoom(),
      waitingRoom({ metadata: { matchTimer: false } }),
      waitingRoom({ metadata: { bestOf: 3 } }),
      waitingRoom({ name: "aegis_unlimited", metadata: { format: "unlimited" } }),
      waitingRoom({ name: "aegis_beta", metadata: { format: undefined } }),
      waitingRoom({
        name: "aegis_manual",
        metadata: { matchTimer: undefined, bestOf: undefined, allowRollback: undefined },
      }),
    ] as never);

    const { buckets } = await readCounts();

    expect(buckets).toEqual(
      expect.arrayContaining([
        { queue: "casual", format: "standard", matchTimer: true, bestOf: 1, allowRollback: false, searching: 2 },
        { queue: "casual", format: "standard", matchTimer: false, bestOf: 1, allowRollback: false, searching: 1 },
        { queue: "casual", format: "standard", matchTimer: true, bestOf: 3, allowRollback: false, searching: 1 },
        { queue: "unlimited", format: "unlimited", matchTimer: true, bestOf: 1, allowRollback: false, searching: 1 },
        { queue: "beta", format: "standard", matchTimer: true, bestOf: 1, allowRollback: false, searching: 1 },
        { queue: "manual", format: "standard", matchTimer: false, bestOf: 1, allowRollback: false, searching: 1 },
      ]),
    );
    expect(buckets).toHaveLength(6);
  });

  it("ignores started, private, empty and non-queue rooms", async () => {
    vi.mocked(matchMaker.query).mockResolvedValue([
      waitingRoom({ locked: true, clients: 2 }),
      waitingRoom({ locked: true, clients: 1 }),
      waitingRoom({ private: true }),
      waitingRoom({ clients: 0 }),
      waitingRoom({ name: "aegis_bot" }),
      waitingRoom({ name: "aegis_private" }),
      waitingRoom({ name: "aegis_ranked" }),
      waitingRoom({ name: "aegis_tournament" }),
    ] as never);

    expect((await readCounts()).buckets).toEqual([]);
  });

  it("publishes only aggregate numbers, never room or player identity", async () => {
    vi.mocked(matchMaker.query).mockResolvedValue([
      waitingRoom({ roomId: "secret-room", metadata: { format: "standard", players: ["Tai"] } }),
    ] as never);

    const body = JSON.stringify(await readCounts());

    expect(body).not.toContain("secret-room");
    expect(body).not.toContain("Tai");
  });

  it("lists each waiting public room anonymously, longest wait first, with its settings", async () => {
    vi.mocked(matchMaker.query).mockResolvedValue([
      waitingRoom({ createdAt: new Date(50_000), metadata: { bestOf: 3 } }),
      waitingRoom({ roomId: "secret-room", createdAt: new Date(10_000), metadata: { players: ["Tai"] } }),
      waitingRoom({ name: "aegis_manual", createdAt: new Date(80_000) }),
      waitingRoom({ locked: true, createdAt: new Date(0) }),
    ] as never);

    const body = await readCounts({ now: () => 100_000 });

    expect(body.waiting).toEqual([
      { queue: "casual", format: "standard", matchTimer: true, bestOf: 1, allowRollback: false, waitingSeconds: 90 },
      { queue: "casual", format: "standard", matchTimer: true, bestOf: 3, allowRollback: false, waitingSeconds: 50 },
      { queue: "manual", format: "standard", matchTimer: true, bestOf: 1, allowRollback: false, waitingSeconds: 20 },
    ]);
    expect(JSON.stringify(body)).not.toContain("secret-room");
    expect(JSON.stringify(body)).not.toContain("Tai");
  });

  it("caps the waiting list at the longest twenty waits", async () => {
    vi.mocked(matchMaker.query).mockResolvedValue(
      Array.from({ length: 25 }, (_, index) => waitingRoom({ createdAt: new Date(index * 1_000) })) as never,
    );

    const { waiting, buckets } = await readCounts({ now: () => 60_000 });

    expect(waiting).toHaveLength(20);
    expect(waiting[0]?.waitingSeconds).toBe(60);
    expect(waiting[19]?.waitingSeconds).toBe(41);
    expect(buckets[0]?.searching).toBe(25);
  });

  it("keeps wait times current while serving a cached room listing", async () => {
    let time = 10_000;
    vi.mocked(matchMaker.query).mockResolvedValue([waitingRoom({ createdAt: new Date(4_000) })] as never);

    await withServer({ now: () => time }, async (get) => {
      expect(((await (await get()).json()) as MatchQueueCounts).waiting[0]?.waitingSeconds).toBe(6);
      time += 3_000;
      expect(((await (await get()).json()) as MatchQueueCounts).waiting[0]?.waitingSeconds).toBe(9);
      expect(matchMaker.query).toHaveBeenCalledTimes(1);
    });
  });

  it("adds ranked searchers per format", async () => {
    vi.mocked(matchMaker.query).mockResolvedValue([]);

    const { buckets } = await readCounts({
      countRankedSearchers: async () => [
        { format: "standard", searching: 3 },
        { format: "pauper", searching: 0 },
      ],
    });

    expect(buckets).toEqual([
      { queue: "ranked", format: "standard", matchTimer: true, bestOf: 1, allowRollback: false, searching: 3 },
    ]);
  });

  it("keeps the public queue counts when the ranked count fails", async () => {
    vi.mocked(matchMaker.query).mockResolvedValue([waitingRoom()] as never);

    const { buckets } = await readCounts({
      countRankedSearchers: async () => {
        throw new Error("database unavailable");
      },
    });

    expect(buckets).toEqual([
      { queue: "casual", format: "standard", matchTimer: true, bestOf: 1, allowRollback: false, searching: 1 },
    ]);
  });

  it("reuses one room query for every request inside the cache window", async () => {
    let time = 1_000;
    vi.mocked(matchMaker.query).mockResolvedValue([waitingRoom()] as never);
    const countRankedSearchers = vi.fn<() => Promise<RankedSearcherCount[]>>(async () => []);

    await withServer({ now: () => time, countRankedSearchers }, async (get) => {
      await get();
      await get();
      time += 4_999;
      await get();
      expect(matchMaker.query).toHaveBeenCalledTimes(1);
      expect(countRankedSearchers).toHaveBeenCalledTimes(1);
      time += 1;
      await get();
      expect(matchMaker.query).toHaveBeenCalledTimes(2);
    });
  });

  it("answers 503 when the room listing is unavailable", async () => {
    vi.mocked(matchMaker.query).mockRejectedValue(new Error("presence down"));

    await withServer({}, async (get) => {
      expect((await get()).status).toBe(503);
    });
  });
});
