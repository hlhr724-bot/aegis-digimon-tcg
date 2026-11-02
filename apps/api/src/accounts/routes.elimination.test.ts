import { buildTournamentRules } from "#api/tournaments/rules/buildTournamentRules";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { snapshotFixtures } from "../db/snapshotFixture.js";
import { RED_DECK } from "../engine/testDecks.js";
import { BotSeatingStore } from "../tournaments/bots/index.js";
import { EliminationStore } from "../tournaments/elimination/index.js";
import { ParticipantStore } from "../tournaments/participants/index.js";

import { SeriesStore } from "../tournaments/series/index.js";
import { SwissProgram } from "../tournaments/swiss/index.js";
import { AccountStore } from "./AccountStore.js";
import { installAccountRoutes } from "./routes.js";

/**
 * The wire behaviour of closing check-in on an ELIMINATION event: the same endpoint the Swiss
 * events use, dispatching by structure. Without this the whole slice is unreachable — no request
 * anywhere else in the system draws a bracket.
 */

type Harness = {
  url: string;
  cookie: string;
  store: AccountStore;
  participants: ParticipantStore;
  bots: BotSeatingStore;
  close: () => Promise<void>;
};

let harness: Harness;

// oxlint-disable-next-line typescript/no-explicit-any -- a wire test asserts the shape, not a DTO
type ResponseBody = any;

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
  const app = express();
  app.use(express.json());
  installAccountRoutes(app, store, participants, series, swiss, elimination, bots);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  openServers.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const organizer = await store.accountForIdentity("discord", "organizer", "Organizer");
  const session = await store.issueSession(organizer);
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    cookie: `aegis_session=${session.id}`,
    store,
    participants,
    bots,
    // The server outlives each test; `afterAll` below shuts it down once the file is done.
    close: async () => {},
  };
}

async function post(path: string): Promise<{ status: number; body: ResponseBody }> {
  const response = await fetch(`${harness.url}${path}`, { method: "POST", headers: { Cookie: harness.cookie } });
  return { status: response.status, body: await response.json().catch(() => null) };
}

/** A lightning cup with `checkedIn` confirmed people. */
async function seedCup(checkedIn: number, allowBots = true): Promise<string> {
  const organizer = (await harness.store.session(harness.cookie.split("=")[1]!))!.account;
  const tournament = await harness.store.createTournament(organizer.id, {
    name: "Lightning Cup",
    block: "BT10",
    startsAt: Date.now() + 86_400_000,
    maxPlayers: 8,
    structure: "single_elimination",
    bestOf: 1,
    allowBots,
    rules: buildTournamentRules({ bestOf: 1 }),
  });
  for (let index = 0; index < checkedIn; index += 1) {
    const name = `Player${index}`;
    const account = await harness.store.accountForIdentity("discord", name.toLowerCase(), name);
    const deck = await harness.store.saveDeck(account.id, {
      name: "Competitive",
      mainDeck: [...RED_DECK.mainDeck],
      eggDeck: [...RED_DECK.eggDeck],
    });
    await harness.participants.register({
      tournamentId: tournament.id,
      accountId: account.id,
      savedDeckId: deck.id,
    });
    await harness.participants.checkIn({ tournamentId: tournament.id, accountId: account.id });
  }
  return tournament.id;
}

beforeEach(async () => {
  harness = await startHarness();
});
afterEach(async () => harness.close());

describe("closing check-in on an elimination event", () => {
  it("draws the bracket and fills the short field with bots", async () => {
    const id = await seedCup(3);
    const closed = await post(`/tournaments/${id}/close-check-in`);
    expect(closed.status).toBe(200);
    expect(closed.body.botsSeated).toBe(1);
    expect(closed.body.bracket.size).toBe(4);
    expect(closed.body.bracket.matches).toHaveLength(3);
    expect((await harness.store.tournament(id))?.status).toBe("in_progress");
  });

  it("is idempotent — a retried close returns the same bracket", async () => {
    const id = await seedCup(4);
    const first = await post(`/tournaments/${id}/close-check-in`);
    const second = await post(`/tournaments/${id}/close-check-in`);
    expect(second.status).toBe(200);
    expect(second.body.bracket.matches).toEqual(first.body.bracket.matches);
    expect(await harness.bots.bots(id)).toEqual([]);
  });

  it("cancels an event that never reached the minimum, and says so", async () => {
    const id = await seedCup(1);
    const closed = await post(`/tournaments/${id}/close-check-in`);
    expect(closed.status).toBe(409);
    expect(closed.body).toEqual({ status: "cancelled", error: "below_minimum" });
    expect((await harness.store.tournament(id))?.status).toBe("cancelled");
  });

  it("cannot be talked into bot-filling a cancelled event by asking again", async () => {
    const id = await seedCup(1);
    await post(`/tournaments/${id}/close-check-in`);
    const again = await post(`/tournaments/${id}/close-check-in`);
    expect(again.status).toBe(409);
    expect(await harness.bots.bots(id)).toEqual([]);
    expect((await harness.store.tournament(id))?.status).toBe("cancelled");
  });

  it("refuses a registration for a cancelled event", async () => {
    const id = await seedCup(1);
    await post(`/tournaments/${id}/close-check-in`);
    const latecomer = await harness.store.accountForIdentity("discord", "late", "Late");
    const deck = await harness.store.saveDeck(latecomer.id, {
      name: "Competitive",
      mainDeck: [...RED_DECK.mainDeck],
      eggDeck: [...RED_DECK.eggDeck],
    });
    expect(
      await harness.participants.register({ tournamentId: id, accountId: latecomer.id, savedDeckId: deck.id }),
    ).toEqual({ ok: false, reason: "registration_closed" });
  });

  it("runs a bots-forbidden event short-handed rather than filling it", async () => {
    const id = await seedCup(3, false);
    const closed = await post(`/tournaments/${id}/close-check-in`);
    expect(closed.status).toBe(200);
    expect(closed.body.botsSeated).toBe(0);
    expect(closed.body.bracket.matches.filter((match: ResponseBody) => match.status === "bye")).toHaveLength(1);
  });
});
