import type { AddressInfo } from "node:net";
import express from "express";
import { createMemoryDatabase } from "#api/db/createMemoryDatabase";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccountStore } from "#api/accounts/AccountStore";
import { installAccountRoutes } from "#api/accounts/routes";

type Harness = {
  url: string;
  store: AccountStore;
  tournamentId: string;
  organizer: string;
  close: () => Promise<void>;
};

type Reply = { status: number; body: Record<string, unknown> };

let harness: Harness;

async function cookieFor(store: AccountStore, name: string): Promise<string> {
  const account = await store.accountForIdentity("discord", name, name);
  return `aegis_session=${(await store.issueSession(account)).id}`;
}

async function startHarness(): Promise<Harness> {
  const store = new AccountStore(new (createMemoryDatabase().adapters.createPg().Pool)() as never);
  const app = express();
  app.use(express.json());
  installAccountRoutes(app, store);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const organizerAccount = await store.accountForIdentity("discord", "organizer", "Organizer");
  const tournament = await store.createTournament(organizerAccount.id, {
    name: "Spectator Cup",
    block: "BT10",
    startsAt: Date.now() + 3_600_000,
    maxPlayers: 8,
  });
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    store,
    tournamentId: tournament.id,
    organizer: await cookieFor(store, "organizer"),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function request(method: string, path: string, cookie?: string, body?: unknown): Promise<Reply> {
  const response = await fetch(`${harness.url}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

beforeEach(async () => {
  harness = await startHarness();
});

afterEach(async () => {
  await harness.close();
});

describe("tournament spectator settings", () => {
  it("lets the organizer choose a policy and manage the allowlist by display name", async () => {
    const path = `/tournaments/${harness.tournamentId}/spectators`;
    expect((await request("GET", path, harness.organizer)).body).toEqual({ policy: "nobody", spectators: [] });

    const policy = await request("PUT", `${path}/policy`, harness.organizer, { policy: "allowlist" });
    expect(policy.body.policy).toBe("allowlist");

    await cookieFor(harness.store, "Caster Kai");
    const added = await request("POST", path, harness.organizer, { displayName: "caster kai" });
    expect(added.body.spectators).toEqual([expect.objectContaining({ displayName: "Caster Kai" })]);

    const [caster] = added.body.spectators as { accountId: string }[];
    const removed = await request("DELETE", `${path}/${caster!.accountId}`, harness.organizer);
    expect(removed.body.spectators).toEqual([]);
  });

  it("refuses an unknown policy and an unknown display name", async () => {
    const path = `/tournaments/${harness.tournamentId}/spectators`;
    expect((await request("PUT", `${path}/policy`, harness.organizer, { policy: "everyone" })).status).toBe(400);
    const missing = await request("POST", path, harness.organizer, { displayName: "Nobody Here" });
    expect(missing).toEqual({ status: 404, body: { error: "spectator_account_not_found" } });
  });

  it("hides the settings from anyone but the organizer and admins", async () => {
    const path = `/tournaments/${harness.tournamentId}/spectators`;
    expect((await request("GET", path)).status).toBe(401);
    const outsider = await cookieFor(harness.store, "outsider");
    expect((await request("GET", path, outsider)).status).toBe(403);
    expect((await request("PUT", `${path}/policy`, outsider, { policy: "signed_in" })).status).toBe(403);
  });
});

describe("tournament detail spectating permission", () => {
  it("tells allowlisted viewers they can watch and everyone else they cannot", async () => {
    const detailPath = `/tournaments/${harness.tournamentId}`;
    const caster = await cookieFor(harness.store, "Caster Kai");
    const outsider = await cookieFor(harness.store, "outsider");
    await request("PUT", `${detailPath}/spectators/policy`, harness.organizer, { policy: "allowlist" });
    await request("POST", `${detailPath}/spectators`, harness.organizer, { displayName: "Caster Kai" });

    expect((await request("GET", detailPath, caster)).body).toMatchObject({
      spectatorPolicy: "allowlist",
      canSpectate: true,
    });
    expect((await request("GET", detailPath, outsider)).body.canSpectate).toBe(false);
    expect((await request("GET", detailPath)).body.canSpectate).toBe(false);
    expect((await request("GET", detailPath, harness.organizer)).body.canSpectate).toBe(true);
  });
});

describe("joining a tournament match as a spectator", () => {
  it("answers not live for a match without a running game", async () => {
    const ticket = await harness.store.createRoomTicket(
      (await harness.store.accountForIdentity("discord", "outsider", "outsider")).id,
    );
    const reply = await request("POST", "/spectate/tournament", undefined, {
      tournamentId: harness.tournamentId,
      matchId: "00000000-0000-4000-8000-000000000000",
      authTicket: ticket,
    });
    expect(reply).toEqual({ status: 404, body: { error: "match_not_live" } });
  });

  it("refuses a malformed request", async () => {
    const reply = await request("POST", "/spectate/tournament", undefined, { tournamentId: "x", matchId: "y" });
    expect(reply.status).toBe(400);
  });
});
