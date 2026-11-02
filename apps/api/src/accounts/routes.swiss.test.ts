import { buildTournamentRules } from "#api/tournaments/rules/buildTournamentRules";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { snapshotFixtures } from "../db/snapshotFixture.js";
import { RED_DECK } from "../engine/testDecks.js";
import { ParticipantStore } from "../tournaments/participants/index.js";

import { SeriesStore } from "../tournaments/series/index.js";
import { SwissProgram } from "../tournaments/swiss/index.js";
import { AccountStore } from "./AccountStore.js";
import { installAccountRoutes } from "./routes.js";

// Wire-level coverage of the two payloads the tournament UI is a pure function of: the detail view
// and the preset catalogue the creation form builds itself from.

type Harness = {
  url: string;
  cookie: string;
  store: AccountStore;
  swiss: SwissProgram;
  close: () => Promise<void>;
};

let harness: Harness;

// oxlint-disable-next-line typescript/no-explicit-any -- a wire test asserts the shape, not a DTO
type ResponseBody = any;

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
  const app = express();
  app.use(express.json());
  installAccountRoutes(app, store, participants, series, swiss);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  openServers.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const organizer = await store.accountForIdentity("discord", "organizer", "Organizer");
  const session = await store.issueSession(organizer);
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    cookie: `aegis_session=${session.id}`,
    store,
    swiss,
    // The server outlives each test; `closeAll` below shuts it down once the file is done.
    close: async () => {},
  };
}

const openServers: (() => Promise<void>)[] = [];

afterAll(async () => {
  for (const close of openServers) await close();
});

async function get(path: string): Promise<{ status: number; body: ResponseBody }> {
  const response = await fetch(`${harness.url}${path}`, { headers: { Cookie: harness.cookie } });
  return { status: response.status, body: await response.json() };
}

/** A Swiss event with four checked-in players, ready for check-in to be closed. */
async function seedSwissTournament(): Promise<string> {
  const organizer = (await harness.store.session(harness.cookie.split("=")[1]!))!.account;
  const tournament = await harness.store.createTournament(organizer.id, {
    name: "Swiss Cup",
    block: "BT10",
    startsAt: Date.now() + 86_400_000,
    maxPlayers: 8,
    structure: "swiss",
    bestOf: 3,
    rules: buildTournamentRules({ bestOf: 3 }),
  });
  const participants = new ParticipantStore(harness.store);
  for (const name of ["Ann", "Ben", "Cid", "Dee"]) {
    const account = await harness.store.accountForIdentity("discord", name.toLowerCase(), name);
    const deck = await harness.store.saveDeck(account.id, {
      name: "Competitive",
      mainDeck: [...RED_DECK.mainDeck],
      eggDeck: [...RED_DECK.eggDeck],
    });
    await participants.register({ tournamentId: tournament.id, accountId: account.id, savedDeckId: deck.id });
    await participants.checkIn({ tournamentId: tournament.id, accountId: account.id });
  }
  return tournament.id;
}

describe("POST /tournaments/:id/sweep", () => {
  beforeEach(async () => {
    harness = await startHarness();
  });
  afterEach(async () => harness.close());

  // A well-formed id nobody owns: the authorization check must be what rejects, not a cast error.
  const UNOWNED = "00000000-0000-0000-0000-0000000000ff";

  async function sweep(cookie: string): Promise<Response> {
    return fetch(`${harness.url}/tournaments/${UNOWNED}/sweep`, { method: "POST", headers: { Cookie: cookie } });
  }

  it("lets the organizer nudge a tournament whose round-close notification was lost", async () => {
    const tournamentId = await seedSwissTournament();
    await fetch(`${harness.url}/tournaments/${tournamentId}/close-check-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: harness.cookie },
      body: "{}",
    });
    const response = await fetch(`${harness.url}/tournaments/${tournamentId}/sweep`, {
      method: "POST",
      headers: { Cookie: harness.cookie },
    });
    expect(response.status).toBe(200);
    // Round 1 is still being played, so there is nothing to advance — and saying so is not an error.
    expect(((await response.json()) as ResponseBody).advanced).toBe(0);
  });

  it("refuses anyone who is not the organizer", async () => {
    const account = await harness.store.accountForIdentity("discord", "intruder", "Intruder");
    const session = await harness.store.issueSession(account);
    expect((await sweep(`aegis_session=${session.id}`)).status).toBe(403);
  });

  it("refuses an anonymous caller", async () => {
    expect((await sweep("")).status).toBe(401);
  });
});

describe("the organizer-only commands refuse everyone else", () => {
  beforeEach(async () => {
    harness = await startHarness();
  });
  afterEach(async () => harness.close());

  async function asIntruder(path: string, body?: unknown): Promise<number> {
    const account = await harness.store.accountForIdentity("discord", "intruder", "Intruder");
    const session = await harness.store.issueSession(account);
    const response = await fetch(`${harness.url}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `aegis_session=${session.id}` },
      body: body === undefined ? "{}" : JSON.stringify(body),
    });
    return response.status;
  }

  // These two commands change what the whole field plays under — closing check-in freezes every
  // deck and starts the event, and the windows decide who may still enter. A signed-in stranger
  // must be refused by the authorization check, not by happening to send a malformed body.
  it("refuses a non-organizer closing check-in", async () => {
    const tournamentId = await seedSwissTournament();
    expect(await asIntruder(`/tournaments/${tournamentId}/close-check-in`)).toBe(403);
    // And the field is untouched: nobody's deck was frozen by the attempt.
    const participants = await new ParticipantStore(harness.store).participants(tournamentId);
    expect(participants.every((participant) => participant.deckSnapshot === null)).toBe(true);
  });

  it("refuses a non-organizer editing the registration windows", async () => {
    const tournamentId = await seedSwissTournament();
    expect(await asIntruder(`/tournaments/${tournamentId}/windows`, { registrationClosesAt: 1 })).toBe(403);
    expect((await get(`/tournaments/${tournamentId}`)).body.windows.registrationClosesAt).not.toBe(1);
  });

  it("refuses an anonymous caller on both", async () => {
    const tournamentId = await seedSwissTournament();
    for (const path of [`/tournaments/${tournamentId}/close-check-in`, `/tournaments/${tournamentId}/windows`]) {
      const response = await fetch(`${harness.url}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      expect(response.status).toBe(401);
    }
  });
});

describe("GET /tournaments/:id", () => {
  beforeEach(async () => {
    harness = await startHarness();
  });
  afterEach(async () => harness.close());

  it("carries phases, rounds, standings, windows and the server clock once the Swiss event starts", async () => {
    const tournamentId = await seedSwissTournament();
    const closed = await fetch(`${harness.url}/tournaments/${tournamentId}/close-check-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: harness.cookie },
      body: "{}",
    });
    expect(closed.status).toBe(200);
    expect(((await closed.json()) as ResponseBody).phase.kind).toBe("swiss");

    const { status, body } = await get(`/tournaments/${tournamentId}`);
    expect(status).toBe(200);
    expect(body.serverNow).toBeGreaterThan(0);
    expect(body.windows).toMatchObject({ registrationClosesAt: null, checkInOpensAt: null, checkInClosesAt: null });

    expect(body.phases).toHaveLength(1);
    const phase = body.phases[0];
    expect(phase).toMatchObject({ kind: "swiss", status: "running", plannedRounds: 3 });
    expect(phase.rounds).toHaveLength(1);
    expect(phase.rounds[0]).toMatchObject({ number: 1, status: "published" });
    expect(phase.rounds[0].matches).toHaveLength(2);
    for (const match of phase.rounds[0].matches) {
      expect(match.joinDeadlineAt).toBeGreaterThan(0);
      expect(match).toMatchObject({ status: "scheduled", wins0: 0, wins1: 0, winnerParticipantId: null });
    }

    expect(body.standings).toHaveLength(4);
    expect(body.standings.map((row: ResponseBody) => row.rank)).toEqual([1, 2, 3, 4]);
    // Every human participant carries the account id the match rows are keyed by, so the client can
    // join the two without a second request.
    expect(body.participants).toHaveLength(4);
    for (const participant of body.participants) {
      expect(participant.status).toBe("active");
      expect(typeof participant.accountId).toBe("string");
    }
  });

  it("reports no phases and empty standings for a tournament that has not started", async () => {
    const tournamentId = await seedSwissTournament();
    const { body } = await get(`/tournaments/${tournamentId}`);
    expect(body.phases).toEqual([]);
    expect(body.standings).toEqual([]);
    expect(body.participants).toHaveLength(4);
  });

  it("answers 409 when closing check-in cannot start the event", async () => {
    const tournamentId = await seedSwissTournament();
    // No confirmed field: check-in closes (the freeze is real) but round 1 cannot be paired, so the
    // event has NOT started and a 200 would say it had.
    await harness.store.pool.query("UPDATE tournament_participants SET status='dropped' WHERE tournament_id=$1", [
      tournamentId,
    ]);
    const closed = await fetch(`${harness.url}/tournaments/${tournamentId}/close-check-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: harness.cookie },
      body: "{}",
    });
    expect(closed.status).toBe(409);
    const body = (await closed.json()) as ResponseBody;
    expect(body.phase).toBeNull();
    expect(body.error).toBe("no_active_participants");
  });

  it("still answers 404 for an unknown tournament", async () => {
    const response = await fetch(`${harness.url}/tournaments/00000000-0000-0000-0000-0000000000ff`, {
      headers: { Cookie: harness.cookie },
    });
    expect(response.status).toBe(404);
  });
});
