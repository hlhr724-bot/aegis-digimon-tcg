import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccountStore, type Account } from "#api/accounts/AccountStore";
import { createMemoryPool } from "#api/db/memoryPool.fixture";
import { FriendStore } from "#api/friends/FriendStore";
import { BlockStore } from "#api/blocks/BlockStore";
import { installFriendRoutes } from "#api/friends/installFriendRoutes";
import { installBlockRoutes } from "#api/blocks/installBlockRoutes";
import { friendLimits } from "@aegis/shared/friends/friendLimits";

let accounts: AccountStore;
let friends: FriendStore;
let blocks: BlockStore;
let first: Account;
let second: Account;
let stranger: Account;
let server: Server | undefined;

beforeEach(async () => {
  accounts = new AccountStore(createMemoryPool());
  first = await accounts.accountForIdentity("email", "first@test.invalid", "First Player");
  second = await accounts.accountForIdentity("email", "second@test.invalid", "Second Player");
  stranger = await accounts.accountForIdentity("email", "stranger@test.invalid", "Stranger");
  friends = new FriendStore(accounts);
  blocks = new BlockStore(accounts);
});

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
  await accounts.close();
});

describe("friendships and requests", () => {
  it("accepts a request atomically with two directions and an acceptance notification", async () => {
    expect(await friends.request({ accountId: first.id, displayName: second.displayName })).toEqual({
      accepted: false,
    });
    expect(await friends.listRequests(second.id)).toMatchObject([{ accountId: first.id, direction: "incoming" }]);
    expect(await friends.listRequests(first.id)).toMatchObject([{ accountId: second.id, direction: "outgoing" }]);
    expect(await friends.accept({ accountId: second.id, otherId: first.id })).toEqual({ accepted: true });
    expect(await friends.list(first.id)).toMatchObject([{ accountId: second.id }]);
    expect(await friends.list(second.id)).toMatchObject([{ accountId: first.id }]);
    expect(await friends.listRequests(first.id)).toEqual([]);
    const notifications = (await accounts.pool.query("SELECT account_id,kind,payload FROM notifications ORDER BY id"))
      .rows;
    expect(notifications).toMatchObject([
      { account_id: first.id, kind: "friend_accepted", payload: { accountId: second.id } },
    ]);
    expect(await friends.request({ accountId: first.id, displayName: second.displayName })).toEqual({
      error: "already_friends",
    });
    await friends.remove({ accountId: first.id, otherId: second.id });
    expect(await friends.list(first.id)).toEqual([]);
    expect(await friends.list(second.id)).toEqual([]);
  });

  it("respects the opponent's initials avatar preference instead of exposing the Discord avatar", async () => {
    await accounts.pool.query("UPDATE accounts SET avatar_url=$2,avatar_id=$3 WHERE id=$1", [
      first.id,
      "https://cdn.discordapp.com/avatars/example.png",
      "initials",
    ]);
    await friends.request({ accountId: first.id, displayName: second.displayName });
    expect(await friends.listRequests(second.id)).toMatchObject([
      { accountId: first.id, avatarId: null, avatarUrl: null },
    ]);
    await friends.accept({ accountId: second.id, otherId: first.id });
    expect(await friends.list(second.id)).toMatchObject([{ accountId: first.id, avatarId: null, avatarUrl: null }]);
    await blocks.block({ accountId: second.id, otherId: first.id });
    expect(await blocks.list(second.id)).toMatchObject([{ accountId: first.id, avatarId: null, avatarUrl: null }]);
  });

  it("auto accepts a reverse request and does not duplicate an outgoing request or its notification", async () => {
    await friends.request({ accountId: first.id, displayName: second.displayName });
    await friends.request({ accountId: first.id, displayName: second.displayName });
    expect((await accounts.pool.query("SELECT * FROM notifications")).rows).toHaveLength(1);
    expect(await friends.request({ accountId: second.id, displayName: first.displayName })).toEqual({ accepted: true });
    expect(await friends.list(first.id)).toHaveLength(1);
  });

  it("declines and cancels only the actor's own requests", async () => {
    await friends.request({ accountId: first.id, displayName: second.displayName });
    await friends.decline({ accountId: stranger.id, otherId: first.id });
    await friends.cancel({ accountId: stranger.id, otherId: second.id });
    expect(await friends.listRequests(second.id)).toHaveLength(1);
    await friends.decline({ accountId: second.id, otherId: first.id });
    expect(await friends.accept({ accountId: second.id, otherId: first.id })).toEqual({ error: "not_found" });
    await friends.request({ accountId: first.id, displayName: second.displayName });
    await friends.cancel({ accountId: first.id, otherId: second.id });
    expect(await friends.listRequests(first.id)).toEqual([]);
  });

  it("removes the request notification once the request is declined, cancelled or blocked", async () => {
    async function requestNotifications() {
      return (await accounts.pool.query("SELECT account_id FROM notifications WHERE kind='friend_request'")).rows;
    }
    await friends.request({ accountId: first.id, displayName: second.displayName });
    expect(await requestNotifications()).toEqual([{ account_id: second.id }]);
    await friends.decline({ accountId: second.id, otherId: first.id });
    expect(await requestNotifications()).toEqual([]);
    await friends.request({ accountId: first.id, displayName: second.displayName });
    await friends.cancel({ accountId: first.id, otherId: second.id });
    expect(await requestNotifications()).toEqual([]);
    await friends.request({ accountId: first.id, displayName: second.displayName });
    await blocks.block({ accountId: second.id, otherId: first.id });
    expect(await requestNotifications()).toEqual([]);
  });

  it("rejects self, unknown players and blocks in either direction", async () => {
    expect(await friends.request({ accountId: first.id, displayName: first.displayName })).toEqual({ error: "self" });
    expect(await blocks.block({ accountId: first.id, otherId: first.id })).toEqual({ error: "self" });
    expect(await friends.request({ accountId: first.id, displayName: "Missing" })).toEqual({ error: "not_found" });
    await blocks.block({ accountId: first.id, otherId: second.id });
    expect(await friends.request({ accountId: first.id, displayName: second.displayName })).toEqual({
      error: "blocked",
    });
    expect(await friends.request({ accountId: second.id, displayName: first.displayName })).toEqual({
      error: "blocked",
    });
    expect(await friends.accept({ accountId: second.id, otherId: first.id })).toEqual({ error: "blocked" });
    await blocks.unblock({ accountId: second.id, otherId: first.id });
    expect(await blocks.list(first.id)).toHaveLength(1);
    await blocks.unblock({ accountId: first.id, otherId: second.id });
    expect(await friends.request({ accountId: second.id, displayName: first.displayName })).toEqual({
      accepted: false,
    });
  });

  it("blocking removes friendships and pending requests without restoring them on unblock", async () => {
    await friends.request({ accountId: first.id, displayName: second.displayName });
    await blocks.block({ accountId: second.id, otherId: first.id });
    expect(await friends.listRequests(first.id)).toEqual([]);
    await blocks.unblock({ accountId: second.id, otherId: first.id });
    await friends.request({ accountId: first.id, displayName: second.displayName });
    await friends.accept({ accountId: second.id, otherId: first.id });
    await blocks.block({ accountId: first.id, otherId: second.id });
    expect(await friends.list(first.id)).toEqual([]);
    expect(await friends.list(second.id)).toEqual([]);
    await blocks.unblock({ accountId: first.id, otherId: second.id });
    expect(await friends.list(first.id)).toEqual([]);
  });

  it("resolves only the caller's retained match and strips opponent IDs from history", async () => {
    const matchId = randomUUID();
    await accounts.recordRecentMatch(first.id, "finished-room", {
      id: matchId,
      mode: "casual",
      opponentName: second.displayName,
      opponentKind: "human",
      opponentAccountId: second.id,
      result: "win",
      reason: "security",
      finishedAt: Date.now(),
    });
    expect(await friends.request({ accountId: stranger.id, matchId })).toEqual({ error: "not_found" });
    expect(await friends.request({ accountId: first.id, matchId })).toEqual({ accepted: false });
    const history = await accounts.matchHistory(first.id, { page: 1, limit: 25 });
    expect(history.matches[0]).toMatchObject({ canAddOpponent: true });
    expect(history.matches[0]).not.toHaveProperty("opponentAccountId");
    await accounts.recordRecentMatch(first.id, "legacy-room", {
      id: "legacy",
      mode: "casual",
      opponentName: second.displayName,
      opponentKind: "human",
      result: "win",
      reason: "security",
      finishedAt: Date.now(),
    });
    expect(await friends.request({ accountId: first.id, matchId: "legacy" })).toEqual({ error: "not_found" });
  });

  it("enforces outgoing and friendship limits, including at acceptance", async () => {
    for (let index = 0; index < friendLimits.outgoingRequests; index++) {
      const target = await accounts.accountForIdentity("email", `pending${index}@test.invalid`, `Pending ${index}`);
      await accounts.pool.query("INSERT INTO friend_requests VALUES ($1,$2,1)", [first.id, target.id]);
    }
    expect(await friends.request({ accountId: first.id, displayName: second.displayName })).toEqual({
      error: "limit_reached",
    });
    await accounts.pool.query("DELETE FROM friend_requests");
    await friends.request({ accountId: first.id, displayName: second.displayName });
    for (let index = 0; index < friendLimits.friends; index++) {
      const target = await accounts.accountForIdentity("email", `friend${index}@test.invalid`, `Friend ${index}`);
      await accounts.pool.query("INSERT INTO friendships VALUES ($1,$2,1)", [second.id, target.id]);
    }
    expect(await friends.accept({ accountId: second.id, otherId: first.id })).toEqual({ error: "limit_reached" });
    expect(await friends.listRequests(first.id)).toHaveLength(1);
  });
});

describe("authenticated social routes", () => {
  it("requires a session, validates targets, scopes mutations and rate limits requests", async () => {
    const app = express();
    app.use(express.json());
    const session = async (req: express.Request) => {
      const id = req.headers["x-test-account"];
      const account = [first, second, stranger].find((candidate) => candidate.id === id);
      return account ? { id: "test-session", account, expiresAt: Date.now() + 60_000 } : undefined;
    };
    installFriendRoutes({ app, store: friends, session });
    installBlockRoutes({
      app,
      store: blocks,
      session,
      resolveOpponent: async (_room, actor) => (actor === first.id ? second.id : undefined),
    });
    server = createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    async function call(path: string, method = "GET", actor?: string, body?: unknown) {
      return fetch(base + path, {
        method,
        headers: { "Content-Type": "application/json", ...(actor ? { "x-test-account": actor } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    }
    for (const path of ["/friends", "/friends/requests", "/account/blocks"]) {
      expect((await call(path)).status).toBe(401);
    }
    for (const body of [
      {},
      { displayName: second.displayName, matchId: "x" },
      { matchId: 42 },
      { displayName: "x".repeat(33) },
    ]) {
      expect((await call("/friends/requests", "POST", stranger.id, body)).status).toBe(400);
    }
    expect((await call("/friends/requests/invalid/accept", "POST", first.id)).status).toBe(400);
    expect((await call("/account/blocks/invalid", "PUT", first.id)).status).toBe(400);
    expect((await call("/friends/requests", "POST", first.id, { displayName: second.displayName })).status).toBe(200);
    expect((await call(`/friends/requests/${first.id}/accept`, "POST", stranger.id)).status).toBe(409);
    expect((await call(`/friends/requests/${first.id}/accept`, "POST", second.id)).status).toBe(200);
    expect(await (await call("/friends", "GET", first.id)).json()).toMatchObject({
      friends: [{ accountId: second.id }],
    });
    expect((await call("/account/blocks/opponent", "POST", stranger.id, { roomId: "active" })).status).toBe(404);
    expect((await call("/account/blocks/opponent", "POST", first.id, { roomId: "active" })).status).toBe(200);
    expect(await friends.list(first.id)).toEqual([]);
    for (let index = 0; index < 20; index++) {
      await call("/friends/requests", "POST", stranger.id, { displayName: "Missing" });
    }
    expect((await call("/friends/requests", "POST", stranger.id, { displayName: "Missing" })).status).toBe(429);
  });
});
