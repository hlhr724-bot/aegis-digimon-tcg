import { RED_DECK } from "#api/engine/testDecks";
import type { AddressInfo } from "node:net";
import express from "express";
import { createMemoryDatabase } from "#api/db/createMemoryDatabase";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AccountStore } from "./AccountStore.js";
import { installAccountRoutes } from "./routes.js";

// Route-level coverage without a new dependency: the real Express app on an ephemeral port, driven
// by global fetch, backed by the same in-memory Postgres the store tests use.

type Harness = {
  url: string;
  cookie: string;
  store: AccountStore;
  close: () => Promise<void>;
};

let harness: Harness;

async function startHarness(): Promise<Harness> {
  const store = new AccountStore(new (createMemoryDatabase().adapters.createPg().Pool)() as never);
  const app = express();
  app.use(express.json());
  installAccountRoutes(app, store);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const account = await store.accountForIdentity("discord", "organizer", "Organizer");
  await store.pool.query("UPDATE accounts SET roles=ARRAY['admin'] WHERE id=$1", [account.id]);
  const admin = await store.accountForIdentity("discord", "organizer", "Organizer");
  const session = await store.issueSession(admin);
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    cookie: `aegis_session=${session.id}`,
    store,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/**
 * A decoded JSON response body. Assertions walk it to arbitrary depth, which is the point of a
 * wire-level test: typing it as the DTO would assert the shape the route is supposed to prove.
 */
// oxlint-disable-next-line typescript/no-explicit-any -- deliberate: see above
type ResponseBody = any;

async function post(path: string, body: unknown): Promise<{ status: number; body: ResponseBody }> {
  const response = await fetch(`${harness.url}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: harness.cookie },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

async function get(path: string): Promise<{ status: number; body: ResponseBody }> {
  const response = await fetch(`${harness.url}${path}`, { headers: { Cookie: harness.cookie } });
  return { status: response.status, body: await response.json() };
}

function futureStart(): number {
  return Date.now() + 86_400_000;
}

beforeEach(async () => {
  harness = await startHarness();
});

afterEach(async () => {
  await harness.close();
});

describe("POST /tournaments", () => {
  it("returns the persisted Discord channel link after completion", async () => {
    const created = await post("/tournaments", { name: "Discord archive", startsAt: futureStart(), maxPlayers: 8 });
    const id = created.body.id;
    expect((await get(`/tournaments/${id}`)).body.discordUrl).toBeNull();
    await harness.store.pool.query(
      "INSERT INTO tournament_discord_posts (tournament_id,guild_id,channel_id,updated_at) VALUES ($1,$2,$3,0)",
      [id, "1525646227608178798", "1564793178366673027"],
    );
    await harness.store.pool.query("UPDATE tournaments SET status='finished' WHERE id=$1", [id]);
    expect((await get(`/tournaments/${id}`)).body.discordUrl).toBe(
      "https://discord.com/channels/1525646227608178798/1564793178366673027",
    );
  });

  it("personalizes catalog membership only for the authenticated account", async () => {
    const me = await get("/auth/me");
    const startsAt = Date.now() + 30 * 60_000;
    const created = await post("/tournaments", { name: "Personal agenda", startsAt, maxPlayers: 8 });
    const deck = await harness.store.saveDeck(me.body.id, {
      name: "Red",
      mainDeck: [...RED_DECK.mainDeck],
      eggDeck: [...RED_DECK.eggDeck],
    });
    expect((await post(`/tournaments/${created.body.id}/participants`, { savedDeckId: deck.id })).status).toBe(201);
    const listing = await get("/tournaments");
    expect(listing.body.find((event: { id: string }) => event.id === created.body.id).myEntry).toEqual({
      status: "registered",
      checkInOpensAt: startsAt - 60 * 60_000,
      checkInClosesAt: null,
    });
    const anonymous = await fetch(`${harness.url}/tournaments`);
    expect(anonymous.headers.get("cache-control")).toBe("private, no-store");
    expect(((await anonymous.json()) as unknown[])[0]).not.toHaveProperty("myEntry");
    const outsider = await harness.store.accountForIdentity("discord", "outsider", "Outsider");
    const session = await harness.store.issueSession(outsider);
    const other = await fetch(`${harness.url}/tournaments?accountId=${me.body.id}`, {
      headers: { Cookie: `aegis_session=${session.id}` },
    });
    expect(((await other.json()) as unknown[])[0]).not.toHaveProperty("myEntry");
    await post(`/tournaments/${created.body.id}/check-in`, {});
    const checked = await get("/tournaments");
    expect(checked.body[0].myEntry.status).toBe("checked_in");
  });

  it("lets a player keep only one open tournament at a time while administrators are exempt", async () => {
    const player = await harness.store.accountForIdentity("discord", "host", "Host");
    const session = await harness.store.issueSession(player);
    const create = (name: string) =>
      fetch(`${harness.url}/tournaments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: `aegis_session=${session.id}` },
        body: JSON.stringify({ name, startsAt: futureStart(), maxPlayers: 8 }),
      });
    const first = await create("First community cup");
    expect(first.status).toBe(201);
    const second = await create("Second community cup");
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: "tournament_limit_reached" });
    await harness.store.pool.query("UPDATE tournaments SET status='finished' WHERE id=$1", [
      ((await first.json()) as { id: string }).id,
    ]);
    expect((await create("Next community cup")).status).toBe(201);
    expect((await post("/tournaments", { name: "Admin cup one", startsAt: futureStart(), maxPlayers: 8 })).status).toBe(
      201,
    );
    expect((await post("/tournaments", { name: "Admin cup two", startsAt: futureStart(), maxPlayers: 8 })).status).toBe(
      201,
    );
  });

  it("lists the nearest upcoming events before completed history", async () => {
    const later = await post("/tournaments", { name: "Later", startsAt: futureStart() + 86400000, maxPlayers: 8 });
    const sooner = await post("/tournaments", { name: "Sooner", startsAt: futureStart(), maxPlayers: 8 });
    const past = await post("/tournaments", { name: "Past", startsAt: futureStart(), maxPlayers: 8 });
    await harness.store.pool.query("UPDATE tournaments SET status='finished',starts_at=$1 WHERE id=$2", [
      Date.now() - 86400000,
      past.body.id,
    ]);
    const listing = await get("/tournaments");
    expect(listing.body.map((event: { id: string }) => event.id)).toEqual([
      sooner.body.id,
      later.body.id,
      past.body.id,
    ]);
  });

  it("requires a saved deck on the legacy registration URL", async () => {
    const created = await post("/tournaments", { name: "Deck required", startsAt: futureStart(), maxPlayers: 8 });
    const response = await post(`/tournaments/${created.body.id}/register`, {});
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("savedDeckId is required");
  });

  it("does not seed unchecked legacy registrations through the start URL", async () => {
    const created = await post("/tournaments", { name: "Check-in required", startsAt: futureStart(), maxPlayers: 8 });
    for (const name of ["legacy-one", "legacy-two"]) {
      const account = await harness.store.accountForIdentity("discord", name, name);
      await harness.store.registerTournament(created.body.id, account.id);
    }
    const response = await post(`/tournaments/${created.body.id}/start`, {});
    expect(response.status).toBe(409);
    const detail = await get(`/tournaments/${created.body.id}`);
    expect(detail.body.matches).toEqual([]);
    expect(detail.body.status).not.toBe("running");
  });

  it("persists a community format with Swiss and best-of-one", async () => {
    const created = await post("/tournaments", {
      name: "Historical community cup",
      startsAt: futureStart(),
      maxPlayers: 8,
      structure: "swiss",
      bestOf: 1,
      topCut: true,
      format: "BT10:pauper",
    });
    expect(created.status).toBe(201);
    expect(created.body.format).toBe("BT10:pauper");
    const detail = await get(`/tournaments/${created.body.id}`);
    expect(detail.body.format).toBe("BT10:pauper");
  });

  it("rejects an unknown deck format", async () => {
    const response = await post("/tournaments", {
      name: "Invalid format",
      startsAt: futureStart(),
      maxPlayers: 8,
      format: "made-up",
    });
    expect(response.status).toBe(400);
    expect(response.body.reasons).toContainEqual({ code: "format_invalid", field: "format" });
  });

  it("publishes password protection without exposing the secret or its hash", async () => {
    const created = await post("/tournaments", {
      name: "Private Cup",
      startsAt: futureStart(),
      maxPlayers: 8,
      password: "community-secret",
    });
    expect(created.status).toBe(201);
    expect(created.body.passwordProtected).toBe(true);
    for (const body of [
      created.body,
      (await get(`/tournaments/${created.body.id}`)).body,
      (await get("/tournaments")).body[0],
    ]) {
      expect(body).not.toHaveProperty("password");
      expect(body).not.toHaveProperty("passwordHash");
      expect(body).not.toHaveProperty("password_hash");
      expect(JSON.stringify(body)).not.toContain("community-secret");
    }
    const registration = await post(`/tournaments/${created.body.id}/participants`, { savedDeckId: "unknown" });
    expect(registration.body.error).toBe("incorrect_password");
    const acceptedPassword = await post(`/tournaments/${created.body.id}/participants`, {
      savedDeckId: "unknown",
      password: "community-secret",
    });
    expect(acceptedPassword.body.error).toBe("deck_not_found");
  });

  it.each([null, 42, {}, "x".repeat(129)])("rejects invalid event passwords %j", async (password) => {
    const response = await post("/tournaments", {
      name: "Private Cup",
      startsAt: futureStart(),
      maxPlayers: 8,
      password,
    });
    expect(response.status).toBe(400);
    expect(response.body.reasons).toContainEqual({ code: "password_invalid", field: "password" });
  });

  it("freezes the organizer clock settings", async () => {
    const created = await post("/tournaments", {
      name: "Community Cup",
      startsAt: futureStart(),
      maxPlayers: 8,
      bestOf: 3,
      clocks: { roundMinutes: 30, eliminationMinutes: 40, finalMinutes: 60, overtimeMinutes: 7 },
    });
    expect(created.status).toBe(201);
    expect(created.body.rules.match).toEqual({
      winsRequired: 2,
      swissDurationMs: 1_800_000,
      topCutDurationMs: 2_400_000,
      finalDurationMs: 3_600_000,
      overtimeMs: 420_000,
    });
    expect((await get(`/tournaments/${created.body.id}`)).body.rules).toEqual(created.body.rules);
  });

  it.each([
    null,
    {},
    [],
    "30",
    { roundMinutes: -1 },
    {
      roundMinutes: 30,
      eliminationMinutes: 40,
      finalMinutes: null,
      overtimeMinutes: 61,
    },
  ])("rejects malformed clock settings %j", async (clocks) => {
    const response = await post("/tournaments", {
      name: "Community Cup",
      startsAt: futureStart(),
      maxPlayers: 8,
      clocks,
    });
    expect(response.status).toBe(400);
    expect(response.body.reasons).toContainEqual({ code: "clock_settings_invalid", field: "clocks" });
  });

  it("persists the normalized public description in the catalog and detail", async () => {
    const created = await post("/tournaments", {
      name: "Community Cup",
      description: "  Weekly community event\nAll players welcome.  ",
      startsAt: futureStart(),
      maxPlayers: 8,
    });
    expect(created.status).toBe(201);
    const description = "Weekly community event\nAll players welcome.";
    expect(created.body.description).toBe(description);
    expect((await get(`/tournaments/${created.body.id}`)).body.description).toBe(description);
    expect((await get("/tournaments")).body[0].description).toBe(description);
  });

  it("rejects oversized or non-text descriptions", async () => {
    const input = { name: "Community Cup", startsAt: futureStart(), maxPlayers: 8 };
    const oversized = await post("/tournaments", { ...input, description: "x".repeat(1001) });
    expect(oversized.status).toBe(400);
    expect(oversized.body.reasons).toContainEqual({ code: "description_too_long", field: "description" });
    expect((await post("/tournaments", { ...input, description: 42 })).status).toBe(400);
  });

  it("still accepts the pre-program payload and creates a legacy single-elimination bracket", async () => {
    const created = await post("/tournaments", {
      name: "Legacy Cup",
      block: "BT10",
      startsAt: futureStart(),
      maxPlayers: 8,
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      structure: "single_elimination",
      bestOf: 1,
      topCutEnabled: false,
      topCutSize: null,
      allowBots: false,
      status: "registration",
      block: "BT10",
      banlistPolicy: { mode: "none" },
      banlistCards: [],
    });
    expect(created.body).not.toHaveProperty("rulesetPreset");
    expect(created.body).not.toHaveProperty("rulesetVersion");
    expect(created.body.rules).not.toHaveProperty("origin");
    expect(created.body.rules).not.toHaveProperty("version");
  });

  it("keeps the deprecated registrations alias alongside registeredCount", async () => {
    const created = await post("/tournaments", { name: "Legacy Cup", startsAt: futureStart(), maxPlayers: 8 });
    expect(created.body.registeredCount).toBe(0);
    expect(created.body.registrations).toBe(0);
  });

  it("accepts the full creation input and returns the frozen ruleset and banlist", async () => {
    const created = await post("/tournaments", {
      name: "Regional Qualifier",
      structure: "swiss",
      topCut: true,
      bestOf: 3,
      startsAt: futureStart(),
      maxPlayers: 64,
      allowBots: false,
      banlist: { mode: "as_of_set", setId: "bt7" },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      structure: "swiss",
      topCutEnabled: true,
      bestOf: 3,
      banlistPolicy: { mode: "as_of_set", setId: "BT7" },
    });
    expect(created.body.rules.match.swissDurationMs).toBe(2_700_000);
    expect(created.body.rules.standings.winRateFloor).toBe(0.33);
    expect(created.body.banlistCards.length).toBeGreaterThan(0);
  });

  it("defaults an omitted banlist to no restrictions", async () => {
    const created = await post("/tournaments", {
      name: "Regional Qualifier",
      structure: "swiss",
      topCut: true,
      bestOf: 3,
      startsAt: futureStart(),
      maxPlayers: 64,
    });
    expect(created.status).toBe(201);
    expect(created.body.banlistPolicy).toEqual({ mode: "none" });
    expect(created.body.banlistCards).toEqual([]);
  });

  it("allows bots without a ruleset restriction", async () => {
    const rejected = await post("/tournaments", {
      name: "Bot Regional",
      structure: "swiss",
      topCut: true,
      bestOf: 3,
      startsAt: futureStart(),
      maxPlayers: 64,
      allowBots: true,
      banlist: { mode: "current" },
    });
    expect(rejected.status).toBe(201);
    expect(rejected.body.allowBots).toBe(true);
  });

  it("rejects a start time in the past with its reason code", async () => {
    const rejected = await post("/tournaments", {
      name: "Yesterday Cup",
      startsAt: Date.now() - 86_400_000,
      maxPlayers: 8,
    });
    expect(rejected.status).toBe(400);
    expect(rejected.body.reasons.map((reason: { code: string }) => reason.code)).toEqual(["starts_at_in_past"]);
  });

  it("rejects a malformed body before any reason code applies", async () => {
    const rejected = await post("/tournaments", { name: "Broken", startsAt: futureStart(), maxPlayers: 8, bestOf: 2 });
    expect(rejected.status).toBe(400);
    expect(rejected.body.reasons).toBeUndefined();
  });

  it("requires a session", async () => {
    const response = await fetch(`${harness.url}/tournaments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "No Session", startsAt: futureStart(), maxPlayers: 8 }),
    });
    expect(response.status).toBe(401);
  });

  it("opens check-in one hour before the start and keeps sign-ups open", async () => {
    const startsAt = futureStart();
    const created = await post("/tournaments", { name: "Evening Cup", startsAt, maxPlayers: 8 });
    const me = await get("/auth/me");
    const deck = await harness.store.saveDeck(me.body.id, {
      name: "Red",
      mainDeck: [...RED_DECK.mainDeck],
      eggDeck: [...RED_DECK.eggDeck],
    });
    expect((await post(`/tournaments/${created.body.id}/participants`, { savedDeckId: deck.id })).status).toBe(201);
    expect(await post(`/tournaments/${created.body.id}/check-in`, {})).toEqual({
      status: 409,
      body: { error: "check_in_not_open" },
    });
    const listing = await get("/tournaments");
    expect(listing.body.find((event: { id: string }) => event.id === created.body.id).myEntry).toEqual({
      status: "registered",
      checkInOpensAt: startsAt - 60 * 60_000,
      checkInClosesAt: null,
    });
  });

  it("allows an authenticated community organizer", async () => {
    const account = await harness.store.accountForIdentity("discord", "player", "Player");
    const session = await harness.store.issueSession(account);
    const response = await fetch(`${harness.url}/tournaments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `aegis_session=${session.id}` },
      body: JSON.stringify({ name: "Player Cup", startsAt: futureStart(), maxPlayers: 8 }),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ name: "Player Cup", createdBy: account.id });
  });
});

describe("GET /tournaments", () => {
  it("lists the summary fields and the deprecated alias", async () => {
    await post("/tournaments", { name: "Legacy Cup", startsAt: futureStart(), maxPlayers: 8 });
    const listed = await get("/tournaments");
    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0]).toMatchObject({
      name: "Legacy Cup",
      status: "registration",
      structure: "single_elimination",
      registeredCount: 0,
      registrations: 0,
      banlistPolicy: { mode: "none" },
    });
    // The list stays a summary: the heavy frozen snapshots belong to the detail view.
    expect(listed.body[0].banlistCards).toBeUndefined();
  });

  it("returns the frozen snapshots and the bracket on the detail view", async () => {
    const created = await post("/tournaments", {
      name: "Regional Qualifier",
      structure: "swiss",
      topCut: true,
      bestOf: 3,
      startsAt: futureStart(),
      maxPlayers: 64,
      banlist: { mode: "as_of_set", setId: "BT10" },
    });
    const detail = await get(`/tournaments/${created.body.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      id: created.body.id,
      banlistPolicy: { mode: "as_of_set", setId: "BT10" },
      matches: [],
    });
    expect(detail.body.rules.timeout.eliminationExtraTurns).toBe(5);
    expect(detail.body.banlistCards).toEqual(created.body.banlistCards);
  });

  it("404s an unknown tournament", async () => {
    const response = await fetch(`${harness.url}/tournaments/00000000-0000-0000-0000-0000000000ff`);
    expect(response.status).toBe(404);
  });
});

describe("DELETE /tournaments/:id", () => {
  it("lets an admin delete another organizer's event", async () => {
    const organizer = await harness.store.accountForIdentity("discord", "other-organizer", "Other Organizer");
    const tournament = await harness.store.createTournament(organizer.id, {
      name: "Other Cup",
      block: "BT10",
      startsAt: futureStart(),
      maxPlayers: 8,
    });

    const response = await fetch(`${harness.url}/tournaments/${tournament.id}`, {
      method: "DELETE",
      headers: { Cookie: harness.cookie },
    });
    expect(response.status).toBe(204);
    expect(await harness.store.tournament(tournament.id)).toBeUndefined();
  });
});

describe("POST /tournaments/:id/discord", () => {
  async function otherTournament(): Promise<string> {
    const organizer = await harness.store.accountForIdentity("discord", "discord-organizer", "Discord Organizer");
    const tournament = await harness.store.createTournament(organizer.id, {
      name: "Discord Cup",
      block: "BT10",
      startsAt: futureStart(),
      maxPlayers: 8,
    });
    return tournament.id;
  }

  it("lets an admin flag a tournament for Discord and shows the flag on the detail view", async () => {
    const id = await otherTournament();
    expect((await get(`/tournaments/${id}`)).body.discordAnnounce).toBe(false);

    const response = await post(`/tournaments/${id}/discord`, { announce: true });

    expect(response).toEqual({ status: 200, body: { discordAnnounce: true } });
    expect((await get(`/tournaments/${id}`)).body.discordAnnounce).toBe(true);
  });

  it("refuses an organizer who is not an admin", async () => {
    const organizer = await harness.store.accountForIdentity("discord", "plain-organizer", "Plain Organizer");
    const session = await harness.store.issueSession(organizer);
    const id = await otherTournament();

    const response = await fetch(`${harness.url}/tournaments/${id}/discord`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `aegis_session=${session.id}` },
      body: JSON.stringify({ announce: true }),
    });

    expect(response.status).toBe(403);
    expect((await get(`/tournaments/${id}`)).body.discordAnnounce).toBe(false);
  });

  it("rejects a non-boolean flag and an unknown tournament", async () => {
    const id = await otherTournament();
    expect((await post(`/tournaments/${id}/discord`, { announce: "yes" })).status).toBe(400);
    const unknown = await fetch(`${harness.url}/tournaments/00000000-0000-4000-8000-000000000000/discord`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: harness.cookie },
      body: JSON.stringify({ announce: true }),
    });
    expect(unknown.status).toBe(404);
  });
});

describe("tournament endorsement", () => {
  it("defaults events to community independently of competitive rules", async () => {
    const created = await post("/tournaments", {
      name: "Community competitive cup",
      startsAt: futureStart(),
      maxPlayers: 8,
      bestOf: 3,
    });
    expect(created.status).toBe(201);
    expect(created.body.category).toBe("community");
    expect((await get(`/tournaments/${created.body.id}`)).body.category).toBe("community");
    expect((await get("/tournaments")).body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.body.id, category: "community" })]),
    );
  });

  it("lets administrators create, endorse and revoke official events", async () => {
    const created = await post("/tournaments", {
      name: "Official cup",
      startsAt: futureStart(),
      maxPlayers: 8,
      category: "official",
    });
    expect(created.status).toBe(201);
    expect(created.body.category).toBe("official");
    for (const category of ["community", "official"]) {
      const updated = await post(`/tournaments/${created.body.id}/category`, { category });
      expect(updated.status).toBe(200);
      expect(updated.body.category).toBe(category);
      expect((await get(`/tournaments/${created.body.id}`)).body.category).toBe(category);
    }
  });

  it("prevents ordinary organizers from granting or revoking endorsement", async () => {
    const account = await harness.store.accountForIdentity("discord", "community-host", "Host");
    const session = await harness.store.issueSession(account);
    harness.cookie = `aegis_session=${session.id}`;
    const input = { name: "Community cup", startsAt: futureStart(), maxPlayers: 8 };
    const rejected = await post("/tournaments", { ...input, category: "official" });
    expect(rejected.status).toBe(403);
    const created = await post("/tournaments", { ...input, category: "community" });
    expect(created.status).toBe(201);
    for (const category of ["official", "community"]) {
      expect((await post(`/tournaments/${created.body.id}/category`, { category })).status).toBe(403);
    }
    expect((await get(`/tournaments/${created.body.id}`)).body.category).toBe("community");
  });

  it("lets official organizers create official events without approving categories", async () => {
    const account = await harness.store.accountForIdentity("discord", "official-host", "Official Host");
    await harness.store.pool.query("UPDATE accounts SET roles=ARRAY['organizer'] WHERE id=$1", [account.id]);
    const session = await harness.store.issueSession(account);
    harness.cookie = `aegis_session=${session.id}`;
    const input = { name: "Store championship", startsAt: futureStart(), maxPlayers: 8 };
    const first = await post("/tournaments", { ...input, category: "official" });
    expect(first.status).toBe(201);
    expect(first.body.category).toBe("official");
    expect((await post("/tournaments", { ...input, category: "official" })).status).toBe(201);
    expect((await post(`/tournaments/${first.body.id}/category`, { category: "community" })).status).toBe(403);
  });

  it("rejects invalid categories without changing the event", async () => {
    const input = { name: "Cup", startsAt: futureStart(), maxPlayers: 8 };
    const created = await post("/tournaments", input);
    for (const category of ["constructor", "OFFICIAL", "", null, true, {}, []]) {
      expect((await post("/tournaments", { ...input, category })).status).toBe(400);
      expect((await post(`/tournaments/${created.body.id}/category`, { category })).status).toBe(400);
    }
    expect((await get(`/tournaments/${created.body.id}`)).body.category).toBe("community");
    expect(
      (await post("/tournaments/00000000-0000-0000-0000-000000000000/category", { category: "official" })).status,
    ).toBe(404);
    const response = await fetch(`${harness.url}/tournaments/${created.body.id}/category`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "official" }),
    });
    expect(response.status).toBe(401);
  });
});

it("keeps registered lists private, permits replacement before freeze, and authorizes round controls", async () => {
  const me = await get("/auth/me");
  const created = await post("/tournaments", {
    name: "Managed rounds",
    startsAt: futureStart(),
    maxPlayers: 8,
    structure: "swiss",
    roundStartMode: "manual",
  });
  expect(created.status).toBe(201);
  const id = created.body.id;
  expect(created.body.roundStartMode).toBe("manual");
  const first = await harness.store.saveDeck(me.body.id, {
    name: "Registered Red",
    mainDeck: [...RED_DECK.mainDeck],
    eggDeck: [...RED_DECK.eggDeck],
  });
  const second = await harness.store.saveDeck(me.body.id, {
    name: "Replacement Red",
    mainDeck: [...RED_DECK.mainDeck],
    eggDeck: [...RED_DECK.eggDeck],
  });
  expect((await post(`/tournaments/${id}/participants`, { savedDeckId: first.id })).status).toBe(201);
  expect((await get(`/tournaments/${id}`)).body.ownDeck).toMatchObject({
    name: "Registered Red",
    savedDeckId: first.id,
    locked: false,
  });
  const publicView = await fetch(`${harness.url}/tournaments/${id}`);
  expect(((await publicView.json()) as { ownDeck: unknown }).ownDeck).toBeNull();
  expect((await post(`/tournaments/${id}/own-deck`, { savedDeckId: second.id })).status).toBe(200);
  expect((await get(`/tournaments/${id}`)).body.ownDeck.name).toBe("Replacement Red");
  expect((await post(`/tournaments/${id}/round-start-mode`, { mode: "automatic" })).status).toBe(200);
  expect((await post(`/tournaments/${id}/round-start-mode`, { mode: "constructor" })).status).toBe(400);
  const outsider = await harness.store.accountForIdentity("discord", "outsider-control", "Outside control");
  const session = await harness.store.issueSession(outsider);
  for (const endpoint of ["round-start-mode", "next-round"]) {
    const response = await fetch(`${harness.url}/tournaments/${id}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `aegis_session=${session.id}` },
      body: JSON.stringify({ mode: "manual" }),
    });
    expect(response.status).toBe(403);
  }
  const outsiderView = await fetch(`${harness.url}/tournaments/${id}`, {
    headers: { Cookie: `aegis_session=${session.id}` },
  });
  expect(((await outsiderView.json()) as { ownDeck: unknown }).ownDeck).toBeNull();
  expect(
    (await post(`/tournaments/${id}/arbitration/cancel`, { reason: "Test event cancelled", commandId: "cancel-event" }))
      .status,
  ).toBe(200);
  expect((await post(`/tournaments/${id}/round-start-mode`, { mode: "manual" })).status).toBe(409);
  expect((await post(`/tournaments/${id}/next-round`, {})).status).toBe(409);
  expect((await get(`/tournaments/${id}`)).body.status).toBe("cancelled");
});
