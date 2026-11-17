import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryPool } from "../db/memoryPool.fixture.js";
import { AccountStore } from "./AccountStore.js";
import { installAccountRoutes } from "./routes.js";

const DAY_MS = 86_400_000;
const SESSION_LIFETIME_SECONDS = 2_592_000;

type Harness = {
  url: string;
  sessionId: string;
  store: AccountStore;
  close: () => Promise<void>;
};

let harness: Harness;

async function startHarness(): Promise<Harness> {
  const store = new AccountStore(createMemoryPool());
  const app = express();
  app.use(express.json());
  installAccountRoutes(app, store);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const account = await store.accountForIdentity("discord", "returning-player", "Tamer", null);
  const session = await store.issueSession(account);
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    sessionId: session.id,
    store,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function me(): Promise<Response> {
  return fetch(`${harness.url}/auth/me`, { headers: { Cookie: `aegis_session=${harness.sessionId}` } });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  harness = await startHarness();
});

afterEach(async () => {
  vi.useRealTimers();
  await harness.close();
  await harness.store.close();
});

describe("session renewal on GET /auth/me", () => {
  it("extends a session that a returning player keeps using", async () => {
    vi.setSystemTime(Date.now() + 10 * DAY_MS);
    const response = await me();
    expect(await response.json()).toMatchObject({ displayName: "Tamer" });
    expect(response.headers.get("set-cookie")).toContain(
      `aegis_session=${harness.sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_LIFETIME_SECONDS}`,
    );
    vi.setSystemTime(Date.now() + 25 * DAY_MS);
    expect(await (await me()).json()).toMatchObject({ displayName: "Tamer" });
  });

  it("leaves a session issued today untouched", async () => {
    const response = await me();
    expect(await response.json()).toMatchObject({ displayName: "Tamer" });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not revive an expired session", async () => {
    vi.setSystemTime(Date.now() + 31 * DAY_MS);
    const response = await me();
    expect(await response.json()).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not revive a revoked session", async () => {
    await harness.store.revokeSession(harness.sessionId);
    vi.setSystemTime(Date.now() + 10 * DAY_MS);
    const response = await me();
    expect(await response.json()).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
