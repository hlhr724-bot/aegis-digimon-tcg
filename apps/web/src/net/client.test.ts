import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { Room } from "@colyseus/sdk";
import type { GameState } from "@aegis/shared";
import { AegisConnectionRouter, connectionSlot, type ColyseusClientPort } from "./client";
import { setRoomTicketAccount } from "./roomAccount";
import type { DeploymentManifest } from "./deployment";

const OPTIONS = { displayName: "Tamer", deck: { mainDeck: [], eggDeck: [] } };

function room(roomId: string): Room<GameState> {
  return { roomId, reconnectionToken: `${roomId}:token` } as Room<GameState>;
}

function clientPort(overrides: Partial<ColyseusClientPort> = {}): ColyseusClientPort {
  const unavailable = async () => {
    throw new Error("no room");
  };
  return {
    join: unavailable,
    joinOrCreate: unavailable,
    create: unavailable,
    joinById: unavailable,
    consumeSeatReservation: unavailable,
    reconnect: unavailable,
    ...overrides,
  };
}

function router({
  manifest,
  blue,
  green,
}: {
  manifest: DeploymentManifest;
  blue: ColyseusClientPort;
  green: ColyseusClientPort;
}): AegisConnectionRouter {
  const clients: Record<string, ColyseusClientPort> = { blue, green };
  return new AegisConnectionRouter({
    loadManifest: async () => manifest,
    endpointForSlot: (slot) => ({
      http: `https://example.test/api/${slot}`,
      websocket: `wss://example.test/api/${slot}`,
    }),
    createClient: (_endpoint, slot) => clients[slot]!,
    fetcher: vi.fn(async () => new Response("{}", { status: 404 })),
  });
}

describe("room-scoped deployment affinity", () => {
  it("routes tournament authorizations without adding a conflicting account ticket", async () => {
    setRoomTicketAccount(true);
    onTestFinished(() => setRoomTicketAccount(false));
    const tournamentRoom = room("tournament-game-room");
    const greenJoin = vi.fn<() => Promise<Room<GameState>>>(async () => tournamentRoom);
    const client = router({
      manifest: { version: 1, active: { slot: "green", revision: "new" }, draining: [] },
      blue: clientPort(),
      green: clientPort({ joinOrCreate: greenJoin }),
    });
    await expect(
      client.joinOrCreate({
        ...OPTIONS,
        tournamentGameId: "game-1",
        tournamentGameToken: "token-1",
        authTicket: "stale",
      }),
    ).resolves.toBe(tournamentRoom);
    expect(greenJoin).toHaveBeenCalledWith(
      "aegis_tournament",
      expect.objectContaining({
        tournamentGameId: "game-1",
        tournamentGameToken: "token-1",
        authTicket: undefined,
      }),
    );
    expect(connectionSlot(tournamentRoom)).toBe("green");
  });

  it("routes an opted-in beta match to the production beta queue", async () => {
    const betaRoom = room("beta-room");
    const greenJoin = vi.fn(async () => betaRoom);
    const client = router({
      manifest: { version: 1, active: { slot: "green", revision: "new" }, draining: [] },
      blue: clientPort(),
      green: clientPort({ joinOrCreate: greenJoin }),
    });
    await expect(client.joinOrCreate({ ...OPTIONS, betaBattleMode: true })).resolves.toBe(betaRoom);
    expect(greenJoin).toHaveBeenCalledWith("aegis_beta", expect.objectContaining({ betaBattleMode: true }));
  });
  it("issue #5202: routes Unlimited to its own queue and rejects ranked or beta combinations", async () => {
    const unlimitedRoom = room("unlimited-room");
    const greenJoin = vi.fn(async () => unlimitedRoom);
    const client = router({
      manifest: { version: 1, active: { slot: "green", revision: "new" }, draining: [] },
      blue: clientPort(),
      green: clientPort({ joinOrCreate: greenJoin }),
    });
    await expect(client.joinOrCreate({ ...OPTIONS, unlimited: true })).resolves.toBe(unlimitedRoom);
    expect(greenJoin).toHaveBeenCalledWith("aegis_unlimited", expect.objectContaining({ unlimited: true }));
    greenJoin.mockClear();
    await expect(client.joinOrCreate({ ...OPTIONS, unlimited: true, ranked: true })).rejects.toThrow();
    await expect(client.joinOrCreate({ ...OPTIONS, unlimited: true, betaBattleMode: true })).rejects.toThrow();
    expect(greenJoin).not.toHaveBeenCalled();
  });
  it("rejects combining beta matchmaking with ranked play", async () => {
    const greenJoin = vi.fn(async () => room("unexpected"));
    const client = router({
      manifest: { version: 1, active: { slot: "green", revision: "new" }, draining: [] },
      blue: clientPort(),
      green: clientPort({ joinOrCreate: greenJoin }),
    });
    await expect(client.joinOrCreate({ ...OPTIONS, betaBattleMode: true, ranked: true })).rejects.toThrow(
      "cannot be ranked",
    );
    expect(greenJoin).not.toHaveBeenCalled();
  });
  it("routes set Unlimited with the full pool/rules combination and normalizes bot and private flags", async () => {
    const greenJoin = vi.fn<ColyseusClientPort["joinOrCreate"]>(async () => room("historical"));
    const create = vi.fn<ColyseusClientPort["create"]>(async () => room("isolated"));
    const client = router({
      manifest: { version: 1, active: { slot: "green", revision: "new" }, draining: [] },
      blue: clientPort(),
      green: clientPort({ joinOrCreate: greenJoin, create }),
    });
    await client.joinOrCreate({ ...OPTIONS, format: "BT13:unlimited" });
    expect(greenJoin).toHaveBeenCalledWith(
      "aegis_unlimited",
      expect.objectContaining({ unlimited: true, format: "BT13:unlimited" }),
    );
    await client.createBot({ ...OPTIONS, format: "BT13:unlimited" });
    expect(create).toHaveBeenLastCalledWith(
      "aegis_bot",
      expect.objectContaining({ unlimited: true, format: "BT13:unlimited" }),
    );
    await client.createPrivate({ ...OPTIONS, format: "BT13:unlimited" });
    expect(create).toHaveBeenLastCalledWith(
      "aegis_private",
      expect.objectContaining({ unlimited: true, format: "BT13:unlimited" }),
    );
    await client.joinOrCreate({ ...OPTIONS, format: "BT13:pauper" });
    expect(greenJoin).toHaveBeenLastCalledWith(
      "aegis",
      expect.objectContaining({ unlimited: false, format: "BT13:pauper" }),
    );
  });
  it("calls the bot endpoint without rebinding the browser fetch receiver", async () => {
    const botRoom = room("bot-room");
    const fetcher = vi.fn(function (this: unknown) {
      if (this !== undefined) throw new TypeError("Illegal invocation");
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as unknown as typeof fetch;
    const client = new AegisConnectionRouter({
      loadManifest: async () => ({
        version: 1,
        active: { slot: "green", revision: "new" },
        draining: [],
      }),
      endpointForSlot: (slot) => ({
        http: `https://example.test/api/${slot}`,
        websocket: `wss://example.test/api/${slot}`,
      }),
      createClient: () => clientPort({ create: async () => botRoom }),
      fetcher,
    });

    const created = await client.createBot(OPTIONS);
    await expect(client.joinWithBot("unjoined-room")).rejects.toThrow("connected room");
    expect(fetcher).not.toHaveBeenCalled();
    created.reconnectionToken = "bot-room:rotated-token";
    await expect(client.joinWithBot(created.roomId)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith(
      "https://example.test/api/green/bot/join",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ roomId: "bot-room", reconnectionToken: "bot-room:rotated-token" }),
      }),
    );
  });

  it("creates bot matches in an isolated room instead of entering casual matchmaking", async () => {
    const botRoom = room("bot-room");
    const greenCreate = vi.fn(async () => botRoom);
    const greenJoinOrCreate = vi.fn(async () => room("casual-room"));
    const client = router({
      manifest: {
        version: 1,
        active: { slot: "green", revision: "new" },
        draining: [{ slot: "blue", revision: "old" }],
      },
      blue: clientPort(),
      green: clientPort({ create: greenCreate, joinOrCreate: greenJoinOrCreate }),
    });

    await expect(client.createBot(OPTIONS)).resolves.toBe(botRoom);
    expect(greenCreate).toHaveBeenCalledWith("aegis_bot", OPTIONS);
    expect(greenJoinOrCreate).not.toHaveBeenCalled();
    expect(connectionSlot(botRoom)).toBe("green");
  });

  it("carries the signed-in account into a casual bot room", async () => {
    setRoomTicketAccount(true);
    onTestFinished(() => setRoomTicketAccount(false));
    const create = vi.fn(async () => room("bot-room"));
    const fetcher = vi.fn(async () => Response.json({ ticket: "ticket-1" }));
    const client = new AegisConnectionRouter({
      loadManifest: async () => ({ version: 1, active: { slot: "green", revision: "new" }, draining: [] }),
      endpointForSlot: (slot) => ({
        http: `https://example.test/api/${slot}`,
        websocket: `wss://example.test/${slot}`,
      }),
      createClient: () => clientPort({ create }),
      fetcher,
    });

    await client.createBot(OPTIONS);

    expect(fetcher).toHaveBeenCalledWith(
      "https://example.test/api/green/auth/room-ticket",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(create).toHaveBeenCalledWith("aegis_bot", { ...OPTIONS, authTicket: "ticket-1" });
  });

  it("creates beta bot matches in the single bot room", async () => {
    const botRoom = room("beta-bot-room");
    const greenCreate = vi.fn(async () => botRoom);
    const client = router({
      manifest: { version: 1, active: { slot: "green", revision: "new" }, draining: [] },
      blue: clientPort(),
      green: clientPort({ create: greenCreate }),
    });

    await expect(client.createBot({ ...OPTIONS, betaBattleMode: true })).resolves.toBe(botRoom);
    expect(greenCreate).toHaveBeenCalledWith("aegis_bot", expect.objectContaining({ betaBattleMode: true }));
  });

  it("refreshes the manifest when the active slot starts draining while creating a bot room", async () => {
    const manifests: DeploymentManifest[] = [
      { version: 1, active: { slot: "blue", revision: "old" }, draining: [] },
      { version: 1, active: { slot: "green", revision: "new" }, draining: [{ slot: "blue", revision: "old" }] },
    ];
    const loadManifest = vi.fn(async () => manifests.shift() ?? manifests[0]!);
    const blueCreate = vi.fn(async () => {
      throw Object.assign(new Error("server is draining"), { code: 503 });
    });
    const greenRoom = room("green-bot-room");
    const greenCreate = vi.fn(async () => greenRoom);
    const clients: Record<string, ColyseusClientPort> = {
      blue: clientPort({ create: blueCreate }),
      green: clientPort({ create: greenCreate }),
    };
    const client = new AegisConnectionRouter({
      loadManifest,
      endpointForSlot: (slot) => ({
        http: `https://example.test/api/${slot}`,
        websocket: `wss://example.test/api/${slot}`,
      }),
      createClient: (_endpoint, slot) => clients[slot]!,
      fetcher: vi.fn(async () => new Response("{}", { status: 404 })),
    });

    await expect(client.createBot(OPTIONS)).resolves.toBe(greenRoom);
    expect(loadManifest).toHaveBeenCalledTimes(2);
    expect(blueCreate).toHaveBeenCalledOnce();
    expect(greenCreate).toHaveBeenCalledWith("aegis_bot", OPTIONS);
    expect(connectionSlot(greenRoom)).toBe("green");
  });

  it("fills a waiting room on the draining slot before creating on active", async () => {
    const oldRoom = room("old-room");
    const blueJoin = vi.fn(async () => oldRoom);
    const greenJoinOrCreate = vi.fn(async () => room("new-room"));
    const client = router({
      manifest: {
        version: 1,
        active: { slot: "green", revision: "new" },
        draining: [{ slot: "blue", revision: "old" }],
      },
      blue: clientPort({ join: blueJoin }),
      green: clientPort({ joinOrCreate: greenJoinOrCreate }),
    });

    await expect(client.joinOrCreate(OPTIONS)).resolves.toBe(oldRoom);
    expect(blueJoin).toHaveBeenCalledOnce();
    expect(greenJoinOrCreate).not.toHaveBeenCalled();
    expect(connectionSlot(oldRoom)).toBe("blue");
  });

  it("creates on active when no draining room can be joined", async () => {
    const newRoom = room("new-room");
    const greenJoinOrCreate = vi.fn(async () => newRoom);
    const client = router({
      manifest: {
        version: 1,
        active: { slot: "green", revision: "new" },
        draining: [{ slot: "blue", revision: "old" }],
      },
      blue: clientPort(),
      green: clientPort({ joinOrCreate: greenJoinOrCreate }),
    });

    await expect(client.joinOrCreate(OPTIONS)).resolves.toBe(newRoom);
    expect(connectionSlot(newRoom)).toBe("green");
  });

  it("reconnects through the room's original slot after active changes", async () => {
    const resumed = room("old-room");
    const blueReconnect = vi.fn(async () => resumed);
    const greenReconnect = vi.fn(async () => room("wrong-room"));
    const client = router({
      manifest: {
        version: 1,
        active: { slot: "green", revision: "new" },
        draining: [{ slot: "blue", revision: "old" }],
      },
      blue: clientPort({ reconnect: blueReconnect }),
      green: clientPort({ reconnect: greenReconnect }),
    });

    await expect(client.reconnect("old-room:token", "blue")).resolves.toBe(resumed);
    expect(blueReconnect).toHaveBeenCalledWith("old-room:token");
    expect(greenReconnect).not.toHaveBeenCalled();
    expect(connectionSlot(resumed)).toBe("blue");
  });

  it("routes joins through the fixed red slot", async () => {
    const redRoom = room("red-room");
    const redJoin = vi.fn(async () => redRoom);
    const clients: Record<string, ColyseusClientPort> = {
      blue: clientPort(),
      red: clientPort({ joinOrCreate: redJoin }),
      green: clientPort(),
    };
    const client = new AegisConnectionRouter({
      loadManifest: async () => ({ version: 1, active: { slot: "red", revision: "red-sha" }, draining: [] }),
      endpointForSlot: (slot) => ({
        http: `https://example.test/api/${slot}`,
        websocket: `wss://example.test/api/${slot}`,
      }),
      createClient: (_endpoint, slot) => clients[slot]!,
      fetcher: vi.fn(async () => new Response("{}", { status: 404 })),
    });

    await expect(client.joinOrCreate(OPTIONS)).resolves.toBe(redRoom);
    expect(redJoin).toHaveBeenCalledOnce();
    expect(connectionSlot(redRoom)).toBe("red");
  });

  it("refreshes the manifest once when active starts draining during matchmaking", async () => {
    const manifests: DeploymentManifest[] = [
      { version: 1, active: { slot: "blue", revision: "old" }, draining: [] },
      { version: 1, active: { slot: "green", revision: "new" }, draining: [{ slot: "blue", revision: "old" }] },
    ];
    const loadManifest = vi.fn(async () => manifests.shift() ?? manifests[0]!);
    const blueJoinOrCreate = vi.fn(async () => {
      throw Object.assign(new Error("This game server is draining; retry on the active slot."), { code: 503 });
    });
    const greenRoom = room("green-room");
    const greenJoinOrCreate = vi.fn(async () => greenRoom);
    const clients: Record<string, ColyseusClientPort> = {
      blue: clientPort({ joinOrCreate: blueJoinOrCreate }),
      green: clientPort({ joinOrCreate: greenJoinOrCreate }),
    };
    const client = new AegisConnectionRouter({
      loadManifest,
      endpointForSlot: (slot) => ({
        http: `https://example.test/api/${slot}`,
        websocket: `wss://example.test/api/${slot}`,
      }),
      createClient: (_endpoint, slot) => clients[slot]!,
      fetcher: vi.fn(async () => new Response("{}", { status: 404 })),
    });

    await expect(client.joinOrCreate(OPTIONS)).resolves.toBe(greenRoom);
    expect(loadManifest).toHaveBeenCalledTimes(2);
    expect(connectionSlot(greenRoom)).toBe("green");
  });
});

it("reserves code-only spectator access on a draining slot and preserves its reconnect affinity", async () => {
  const watched = room("watched-match");
  const consume = vi.fn(async () => watched);
  const fetcher = vi.fn(async (input: RequestInfo | URL) =>
    String(input).includes("/green/")
      ? new Response("{}", { status: 404 })
      : new Response(JSON.stringify({ sessionId: "observer", roomId: "watched-match" })),
  );
  const client = new AegisConnectionRouter({
    loadManifest: async () => ({
      version: 1,
      active: { slot: "green", revision: "new" },
      draining: [{ slot: "blue", revision: "old" }],
    }),
    endpointForSlot: (slot) => ({
      http: `https://example.test/api/${slot}`,
      websocket: `wss://example.test/api/${slot}`,
    }),
    createClient: (_endpoint, slot) =>
      slot === "blue" ? clientPort({ consumeSeatReservation: consume }) : clientPort(),
    fetcher,
  });
  expect(await client.spectate({ roomCode: "ABCDEF" })).toBe(watched);
  expect(connectionSlot(watched)).toBe("blue");
  expect(fetcher).toHaveBeenNthCalledWith(
    1,
    "https://example.test/api/green/spectate/join",
    expect.objectContaining({ body: JSON.stringify({ roomCode: "ABCDEF" }) }),
  );
  expect(consume).toHaveBeenCalledWith({ sessionId: "observer", roomId: "watched-match" });
});

it("preserves Unlimited and beta bot flags on the production and private paths", async () => {
  const created = room("unlimited-bot");
  const create = vi.fn<ColyseusClientPort["create"]>(async () => created);
  const client = router({
    manifest: { version: 1, active: { slot: "green", revision: "new" }, draining: [] },
    blue: clientPort(),
    green: clientPort({ create }),
  });
  await client.createBot({ ...OPTIONS, unlimited: true, betaBattleMode: true });
  expect(create).toHaveBeenLastCalledWith(
    "aegis_bot",
    expect.objectContaining({ unlimited: true, betaBattleMode: true }),
  );
  await client.createPrivate({ ...OPTIONS, unlimited: true });
  expect(create).toHaveBeenLastCalledWith("aegis_private", expect.objectContaining({ unlimited: true, private: true }));
});

it("reads the private host rules from a draining slot before joining there", async () => {
  const joined = room("private-blue");
  const joinById = vi.fn<ColyseusClientPort["joinById"]>(async () => joined);
  const fetcher = vi.fn<typeof fetch>(async (url: RequestInfo | URL) =>
    String(url).includes("/green/")
      ? new Response("{}", { status: 404 })
      : new Response(JSON.stringify({ roomId: joined.roomId, unlimited: true })),
  );
  const client = new AegisConnectionRouter({
    loadManifest: async () => ({
      version: 1,
      active: { slot: "green", revision: "new" },
      draining: [{ slot: "blue", revision: "old" }],
    }),
    endpointForSlot: (slot) => ({
      http: `https://example.test/api/${slot}`,
      websocket: `wss://example.test/api/${slot}`,
    }),
    createClient: (_endpoint, slot) => (slot === "blue" ? clientPort({ joinById }) : clientPort()),
    fetcher,
  });
  expect(await client.lookupPrivateRoom("abc234")).toEqual({
    roomId: joined.roomId,
    unlimited: true,
    format: "unlimited",
  });
  await client.joinPrivateByCode("abc234", { ...OPTIONS, unlimited: true });
  expect(joinById).toHaveBeenCalledWith(
    joined.roomId,
    expect.objectContaining({ unlimited: true, roomCode: "ABC234" }),
  );
  expect(connectionSlot(joined)).toBe("blue");
});

it("merges each slot's first page of live matches and skips an unreachable slot", async () => {
  const live = (spectatorCode: string, spectators: number, startedAt: number) => ({
    spectatorCode,
    players: ["A", "B"],
    format: "standard",
    startedAt,
    spectators,
  });
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/green/"))
      return Response.json({ matches: [live("BUSYXX", 9, 1), live("QUIETX", 0, 5)], total: 4 });
    if (url.includes("/blue/")) return Response.json({ matches: [live("NEWERX", 0, 8)], total: 1 });
    return new Response("{}", { status: 503 });
  }) as unknown as typeof fetch;
  const client = new AegisConnectionRouter({
    loadManifest: async () => ({
      version: 1,
      active: { slot: "green", revision: "new" },
      draining: [
        { slot: "blue", revision: "old" },
        { slot: "red", revision: "older" },
      ],
    }),
    endpointForSlot: (slot) => ({ http: `https://example.test/api/${slot}`, websocket: "" }),
    createClient: () => clientPort(),
    fetcher,
  });
  const page = await client.liveMatches(2);
  expect(page.matches.map((match) => match.spectatorCode)).toEqual(["BUSYXX", "NEWERX"]);
  expect(page.total).toBe(5);
  expect(fetcher).toHaveBeenCalledWith("https://example.test/api/green/spectate/live?limit=2");
});

it("sums each slot's queue counts, merges waiting players by longest wait, and skips an unreachable slot", async () => {
  const bucket = (searching: number, matchTimer = true) => ({
    queue: "casual",
    format: "standard",
    matchTimer,
    bestOf: 1,
    allowRollback: false,
    searching,
  });
  const waiting = (waitingSeconds: number) => ({
    queue: "casual",
    format: "standard",
    matchTimer: true,
    bestOf: 1,
    allowRollback: false,
    waitingSeconds,
  });
  const fetcher = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.includes("/green/"))
      return Response.json({ buckets: [bucket(2), bucket(1, false)], waiting: [waiting(30), waiting(90)] });
    if (url.includes("/blue/")) return Response.json({ buckets: [bucket(1)] });
    return new Response("{}", { status: 503 });
  });
  const client = new AegisConnectionRouter({
    loadManifest: async () => ({
      version: 1,
      active: { slot: "green", revision: "new" },
      draining: [
        { slot: "blue", revision: "old" },
        { slot: "red", revision: "older" },
      ],
    }),
    endpointForSlot: (slot) => ({ http: `https://example.test/api/${slot}`, websocket: "" }),
    createClient: () => clientPort(),
    fetcher,
  });
  const counts = await client.matchQueueCounts();
  expect(counts.buckets).toEqual([bucket(3), bucket(1, false)]);
  expect(counts.waiting).toEqual([waiting(90), waiting(30)]);
  expect(fetcher).toHaveBeenCalledWith("https://example.test/api/green/matchmaking/queues");
});

it("attaches an account ticket when a signed-in viewer reserves spectator access", async () => {
  setRoomTicketAccount(true);
  onTestFinished(() => setRoomTicketAccount(false));
  const watched = room("watched-match");
  const fetcher = vi.fn<typeof fetch>(
    async (input) =>
      new Response(
        JSON.stringify(
          String(input).endsWith("/auth/room-ticket")
            ? { ticket: "spectator-account-ticket" }
            : { sessionId: "observer", roomId: "watched-match" },
        ),
      ),
  );
  const client = new AegisConnectionRouter({
    loadManifest: async () => ({ version: 1, active: { slot: "green", revision: "new" }, draining: [] }),
    endpointForSlot: () => ({ http: "https://example.test/api/green", websocket: "wss://example.test/api/green" }),
    createClient: () => clientPort({ consumeSeatReservation: async () => watched }),
    fetcher,
  });
  expect(await client.spectate({ roomCode: "ABCDEF" })).toBe(watched);
  expect(fetcher).toHaveBeenNthCalledWith(
    1,
    "https://example.test/api/green/auth/room-ticket",
    expect.objectContaining({ credentials: "include" }),
  );
  expect(fetcher).toHaveBeenNthCalledWith(
    2,
    "https://example.test/api/green/spectate/join",
    expect.objectContaining({ body: JSON.stringify({ roomCode: "ABCDEF", authTicket: "spectator-account-ticket" }) }),
  );
});
