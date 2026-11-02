import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountStore, type Account, type AuthSession } from "#api/accounts/AccountStore";
import { AccountRole } from "@aegis/shared/account/AccountRole";
import { createMemoryPool } from "#api/db/memoryPool.fixture";
import { installRankedRoutes } from "#api/ranked/installRankedRoutes";

let accounts: AccountStore;
let server: Server;
let base: string;
let currentSession: AuthSession | undefined;

function signIn(roles: AccountRole[]) {
  currentSession = {
    id: "session",
    expiresAt: Number.MAX_SAFE_INTEGER,
    account: { id: "00000000-0000-4000-8000-000000000001", roles } as Account,
  };
}

function send(path: string, method: string, body?: unknown) {
  return fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(async () => {
  currentSession = undefined;
  vi.stubEnv("AEGIS_RANKED_ENABLED", "true");
  accounts = new AccountStore(createMemoryPool());
  await accounts.ensureReady();
  const app = express();
  app.use(express.json());
  installRankedRoutes({ app, accounts, session: async () => currentSession });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("test server address missing");
  }
  base = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await accounts.close();
});

describe("ranked route boundaries", () => {
  it("hides every ranked route except the config while ranked is disabled", async () => {
    vi.stubEnv("AEGIS_RANKED_ENABLED", "false");
    signIn([AccountRole.ADMIN.value]);
    expect(await (await send("/ranked/config", "GET")).json()).toMatchObject({ enabled: false });
    for (const [method, path] of [
      ["GET", "/ranked/seasons"],
      ["GET", "/ranked/leaderboard"],
      ["GET", "/ranked/meta?season=1"],
      ["GET", "/ranked/matchups"],
      ["GET", "/ranked/players/00000000-0000-4000-8000-000000000001/decks?season=1"],
      ["GET", "/ranked/reports"],
      ["GET", "/ranked/rewards"],
      ["POST", "/ranked/queue"],
      ["GET", "/account/admin/ranked/reports"],
    ]) {
      const response = await send(path, method);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "ranked_unavailable" });
    }
  });
  it("rejects queue formats outside the curated first season before creating a queue entry", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 9, 24));
    vi.stubEnv("AEGIS_RANKED_FORMATS", "standard,BT10,pauper");
    signIn([]);
    for (const format of ["BT10", "pauper", "unlimited"]) {
      const response = await send("/ranked/queue", "POST", { deckId: "saved-deck", format, region: "south_america" });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "ranked_invalid_queue" });
    }
    expect((await accounts.pool.query("SELECT * FROM ranked_queue")).rows).toEqual([]);
  });

  it("does not admit queue entries before the next season's formats are selected", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 11, 8));
    signIn([]);
    expect(await (await send("/ranked/config", "GET")).json()).toEqual({ enabled: true, formats: [] });
    const response = await send("/ranked/queue", "POST", {
      deckId: "saved-deck",
      format: "standard",
      region: "south_america",
    });
    expect(response.status).toBe(400);
    expect((await accounts.pool.query("SELECT * FROM ranked_queue")).rows).toEqual([]);
  });
  it("requires authentication for queue, rewards and Discord mutations", async () => {
    for (const [method, path] of [
      ["POST", "/ranked/queue"],
      ["DELETE", "/ranked/queue"],
      ["GET", "/ranked/queue"],
      ["GET", "/ranked/rewards"],
      ["POST", "/ranked/rewards/equip"],
      ["POST", "/ranked/discord"],
    ]) {
      const response = await fetch(`${base}${path}`, { method });
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
  });
  it("rejects malformed and prototype-property filters", async () => {
    for (const path of [
      "/ranked/leaderboard?region=constructor",
      "/ranked/leaderboard?page=NaN",
      "/ranked/matchups?origin=casual",
      "/ranked/matchups?from=10&until=1",
    ]) {
      expect((await fetch(`${base}${path}`)).status).toBe(400);
    }
  });
  it("requires a signed-in player to read or file ranked game reports", async () => {
    expect((await send("/ranked/reports", "GET")).status).toBe(401);
    expect((await send("/ranked/reports", "POST", {})).status).toBe(401);
  });
  it("lets only judges and admins review ranked game reports", async () => {
    const reportPath = "/account/admin/ranked/reports/00000000-0000-4000-8000-000000000002";
    const requests = [
      ["/account/admin/ranked/reports", "GET", undefined],
      [`${reportPath}/replay`, "GET", undefined],
      [`${reportPath}/ruling`, "POST", { ruling: "confirmed" }],
    ] as const;
    for (const [path, method, body] of requests) {
      expect((await send(path, method, body)).status).toBe(401);
    }
    signIn([]);
    for (const [path, method, body] of requests) {
      expect((await send(path, method, body)).status).toBe(403);
    }
    signIn([AccountRole.ORGANIZER.value]);
    for (const [path, method, body] of requests) {
      expect((await send(path, method, body)).status).toBe(403);
    }
    signIn([AccountRole.JUDGE.value]);
    expect((await send(`${reportPath}/ruling`, "POST", { ruling: "pending" })).status).toBe(400);
    expect((await send(`${reportPath}/ruling`, "POST", { ruling: "constructor" })).status).toBe(400);
  });
  it("rejects ranked game reports without a game, a turn or a description", async () => {
    signIn([]);
    const pairId = "00000000-0000-4000-8000-000000000003";
    for (const body of [
      { pairId, turn: 3 },
      { pairId, turn: 3, description: "   " },
      { pairId, turn: -1, description: "Bug" },
      { pairId, turn: 1.5, description: "Bug" },
      { pairId, turn: "3", description: "Bug" },
      { pairId: "not-a-game", turn: 3, description: "Bug" },
      { pairId, turn: 3, description: "x".repeat(2001) },
    ]) {
      expect((await send("/ranked/reports", "POST", body)).status).toBe(400);
    }
  });
});

it("rejects invalid player deck filters and allows a public empty history", async () => {
  const badPlayer = await send("/ranked/players/not-an-id/decks?season=1&format=standard", "GET");
  expect(badPlayer.status).toBe(400);
  const id = "00000000-0000-4000-8000-000000000001";
  expect((await send(`/ranked/players/${id}/decks?season=bad&format=standard`, "GET")).status).toBe(400);
  expect((await send(`/ranked/players/${id}/decks?season=1&format=unlimited`, "GET")).status).toBe(400);
  const response = await send(`/ranked/players/${id}/decks?season=1&format=standard`, "GET");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([]);
});
