import { buildTournamentRules } from "#api/tournaments/rules/buildTournamentRules";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { snapshotFixtures } from "../db/snapshotFixture.js";
import { RED_DECK } from "../engine/testDecks.js";
import { ArbitrationService, tokenBucketLimiter } from "../tournaments/arbitration/index.js";
import { BotSeatingStore } from "../tournaments/bots/index.js";
import { EliminationStore } from "../tournaments/elimination/index.js";
import { ParticipantStore } from "../tournaments/participants/index.js";

import { SeriesStore } from "../tournaments/series/index.js";
import { SwissProgram } from "../tournaments/swiss/index.js";
import { AccountStore } from "./AccountStore.js";
import { installAccountRoutes } from "./routes.js";

// Route-level coverage without a new dependency, matching the sibling routes tests: the real Express
// app on an ephemeral port, driven by global fetch, over the same in-memory Postgres.

// oxlint-disable-next-line typescript/no-explicit-any -- a wire body is untyped by definition
type ResponseBody = any;

type Harness = {
  url: string;
  cookies: Record<string, string>;
  store: AccountStore;
  series: SeriesStore;
  tournamentId: string;
  matchIds: string[];
  /** Who the pairer put in seat 0 of each match, so a test can act as that player. */
  seat0: string[];
  close: () => Promise<void>;
};

let harness: Harness;

async function post(path: string, as: string, body: unknown): Promise<{ status: number; body: ResponseBody }> {
  const response = await fetch(`${harness.url}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: harness.cookies[as] ?? "" },
    body: JSON.stringify(body),
  });
  const json = response.headers.get("content-type")?.includes("application/json");
  return { status: response.status, body: json ? await response.json() : null };
}

async function get(path: string, as: string): Promise<{ status: number; body: ResponseBody }> {
  const response = await fetch(`${harness.url}${path}`, { headers: { Cookie: harness.cookies[as] ?? "" } });
  const json = response.headers.get("content-type")?.includes("application/json");
  return { status: response.status, body: json ? await response.json() : null };
}

const openServers: (() => Promise<void>)[] = [];

afterAll(async () => {
  for (const close of openServers) await close();
});

/**
 * One express server and one database for the file, restored to its just-started state before each
 * test. Standing the server up and re-migrating per test cost far more than the requests under
 * test; the snapshot makes every test see the same clean database without paying for either.
 */
const harnessFor = snapshotFixtures<Harness>();

async function startHarness(): Promise<Harness> {
  return harnessFor("default", buildHarness);
}

async function buildHarness(pool: Pool): Promise<Harness> {
  const store = new AccountStore(pool);
  const participants = new ParticipantStore(store);
  const series = new SeriesStore(store);
  const swiss = new SwissProgram(store, series);
  const elimination = new EliminationStore(store);
  const bots = new BotSeatingStore(store);
  const arbitration = new ArbitrationService(store, participants, series, swiss, elimination);
  series.addResolutionListener(({ matchId }) => swiss.onSeriesResolved(matchId).then(() => undefined));

  const app = express();
  app.use(express.json());
  installAccountRoutes(app, store, participants, series, swiss, elimination, bots, undefined, arbitration);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  openServers.push(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const cookies: Record<string, string> = {};
  const accountIds: Record<string, string> = {};
  for (const name of ["organizer", "alice", "bob", "carol", "dave", "intruder"]) {
    const account = await store.accountForIdentity("discord", name, name);
    accountIds[name] = account.id;
    const cookie = `aegis_session=${(await store.issueSession(account)).id}`;
    // Keyed by BOTH name and account id: the pairer decides who sits where, so a test that wants to
    // act as "whoever holds seat 0" has only the account id to go on.
    cookies[name] = cookie;
    cookies[account.id] = cookie;
  }

  const now = Date.now();
  const tournament = await store.createTournament(accountIds.organizer!, {
    name: "Regional",
    block: "BT10",
    startsAt: now + 86_400_000,
    maxPlayers: 8,
    structure: "swiss",
    bestOf: 3,
    rules: buildTournamentRules({ bestOf: 3 }),
  });
  for (const name of ["alice", "bob", "carol", "dave"]) {
    const deck = await store.saveDeck(accountIds[name]!, {
      name: "Competitive",
      mainDeck: [...RED_DECK.mainDeck],
      eggDeck: [...RED_DECK.eggDeck],
    });
    await participants.register({ tournamentId: tournament.id, accountId: accountIds[name]!, savedDeckId: deck.id });
    await participants.checkIn({ tournamentId: tournament.id, accountId: accountIds[name]! });
  }
  await participants.closeCheckIn({ tournamentId: tournament.id });
  await swiss.startTournamentProgram(tournament.id);
  const paired = (await series.scoreViews(tournament.id)).filter((view) => view.participant0Id && view.participant1Id);
  const matchIds = paired.map((view) => view.matchId);
  const seat0 = paired.map((view) => view.participant0Id!);

  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    cookies,
    store,
    series,
    tournamentId: tournament.id,
    matchIds,
    seat0,
    // The server outlives each test; `afterAll` below shuts it down once the file is done.
    close: async () => {},
  };
}

describe("arbitration routes", () => {
  beforeEach(async () => {
    harness = await startHarness();
  });
  afterEach(async () => {
    await harness.close();
    await harness.store.close();
  });

  it("refuses an anonymous caller", async () => {
    const response = await fetch(`${harness.url}/tournaments/${harness.tournamentId}/arbitration/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "no" }),
    });
    expect(response.status).toBe(401);
  });

  it("refuses a signed-in caller who is not the organizer", async () => {
    const response = await post(`/tournaments/${harness.tournamentId}/arbitration/cancel`, "intruder", {
      reason: "let me in",
    });
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "not_organizer" });
  });

  it("refuses a command with no reason", async () => {
    const response = await post(`/tournaments/${harness.tournamentId}/arbitration/cancel`, "organizer", {});
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "reason_required" });
  });

  it("answers 404 for a match of another tournament", async () => {
    const response = await post(
      `/tournaments/${harness.tournamentId}/arbitration/matches/00000000-0000-0000-0000-0000000000ff/concede`,
      "organizer",
      { reason: "gone" },
    );
    expect(response.status).toBe(404);
  });

  it("concedes, and reports the audit sequence it wrote", async () => {
    const response = await post(
      `/tournaments/${harness.tournamentId}/arbitration/matches/${harness.matchIds[0]}/concede`,
      harness.seat0[0]!,
      { reason: "cannot continue" },
    );
    expect(response.status).toBe(200);
    // A positive sequence, not a fixed one: the trail also carries the machine events this round's
    // publication and the concession's own resolution wrote.
    expect(response.body.sequence).toBeGreaterThan(0);
    expect(response.body.replayed).toBe(false);
    expect(response.body.alreadyApplied).toBe(false);
    expect(response.body.reasonCode).toBe("concession");
  });

  it("treats a retried command with the same id as one command", async () => {
    const body = { reason: "cannot continue", commandId: "retry-me" };
    const first = await post(
      `/tournaments/${harness.tournamentId}/arbitration/matches/${harness.matchIds[0]}/concede`,
      harness.seat0[0]!,
      body,
    );
    const second = await post(
      `/tournaments/${harness.tournamentId}/arbitration/matches/${harness.matchIds[0]}/concede`,
      harness.seat0[0]!,
      body,
    );
    expect(first.body.replayed).toBe(false);
    expect(second.body.replayed).toBe(true);
    expect(second.body.sequence).toBe(first.body.sequence);
  });

  it("serves the trail to the organizer and hides it from everyone else", async () => {
    await post(`/tournaments/${harness.tournamentId}/arbitration/cancel`, "organizer", { reason: "power cut" });
    const owned = await get(`/tournaments/${harness.tournamentId}/arbitration/events`, "organizer");
    expect(owned.status).toBe(200);
    const cancels = owned.body.filter((event: ResponseBody) => event.command === "cancel_tournament");
    expect(cancels).toHaveLength(1);
    expect(cancels[0].reason).toBe("power cut");
    expect((await get(`/tournaments/${harness.tournamentId}/arbitration/events`, "intruder")).status).toBe(403);
  });

  it("rate limits a caller past the bucket", async () => {
    // A dedicated app, so the limit under test is the only thing the burst can hit.
    const app = express();
    app.use(express.json());
    const store = harness.store;
    const participants = new ParticipantStore(store);
    const series = new SeriesStore(store);
    installAccountRoutes(
      app,
      store,
      participants,
      series,
      new SwissProgram(store, series),
      new EliminationStore(store),
      new BotSeatingStore(store),
      undefined,
      new ArbitrationService(store, participants, series, new SwissProgram(store, series), new EliminationStore(store)),
    );
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const response = await fetch(`${url}/tournaments/${harness.tournamentId}/arbitration/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: harness.cookies.organizer! },
          body: JSON.stringify({ reason: "power cut", commandId: `burst-${attempt}` }),
        });
        statuses.push(response.status);
      }
      expect(statuses).toContain(429);
      // No request may 500. A burst is the shape that finds an unhandled throw — there is no express
      // error handler behind these routes, so anything the service throws reaches the client as one.
      expect(statuses.filter((status) => status >= 500)).toEqual([]);
      expect(statuses.every((status) => status < 300 || (status >= 400 && status < 500))).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("uses the limiter it is given", async () => {
    const limiter = tokenBucketLimiter({ capacity: 0, refillMs: 1_000 });
    expect(limiter("anyone")).toBe(false);
  });
});
