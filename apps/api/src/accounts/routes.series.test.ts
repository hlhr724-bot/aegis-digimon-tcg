import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { snapshotFixtures } from "../db/snapshotFixture.js";
import { AccountStore } from "./AccountStore.js";
import { installAccountRoutes } from "./routes.js";

// Wire-level coverage of the confrontation endpoints, on the same harness shape as
// routes.tournament.test.ts: the real Express app on an ephemeral port, driven by global fetch.

type Harness = {
  url: string;
  cookies: Record<"alice" | "bob" | "carol", string>;
  store: AccountStore;
  close: () => Promise<void>;
};

let harness: Harness;
let tournamentId: string;
let matchId: string;
let accounts: Record<"alice" | "bob" | "carol", string>;

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
  const app = express();
  app.use(express.json());
  installAccountRoutes(app, store);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  openServers.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const cookies = {} as Record<"alice" | "bob" | "carol", string>;
  accounts = {} as Record<"alice" | "bob" | "carol", string>;
  for (const name of ["alice", "bob", "carol"] as const) {
    const account = await store.accountForIdentity("discord", name, name);
    accounts[name] = account.id;
    // Alice runs the event: creating a tournament is an admin-only endpoint.
    if (name === "alice") await store.pool.query("UPDATE accounts SET roles=ARRAY['admin'] WHERE id=$1", [account.id]);
    cookies[name] = `aegis_session=${(await store.issueSession(account)).id}`;
  }
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    cookies,
    store,
    // The server outlives each test; `afterAll` below shuts it down once the file is done.
    close: async () => {},
  };
}

// oxlint-disable-next-line typescript/no-explicit-any -- assertions walk the decoded body freely
type ResponseBody = any;

async function post(
  path: string,
  as: keyof Harness["cookies"],
  body: unknown = {},
): Promise<{ status: number; body: ResponseBody }> {
  const response = await fetch(`${harness.url}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: harness.cookies[as] },
    body: JSON.stringify(body),
  });
  // `sendStatus` replies in plain text, so the body is only decoded when it claims to be JSON.
  const json = response.headers.get("content-type")?.includes("application/json");
  return { status: response.status, body: json ? await response.json() : null };
}

async function get(path: string, as: keyof Harness["cookies"]): Promise<{ status: number; body: ResponseBody }> {
  const response = await fetch(`${harness.url}${path}`, { headers: { Cookie: harness.cookies[as] } });
  return { status: response.status, body: await response.json() };
}

/** A swiss best-of-three event with one published Alice-vs-Bob pairing. */
async function seedMatch(): Promise<void> {
  const created = await post("/tournaments", "alice", {
    name: "Regional Qualifier",
    structure: "swiss",
    topCut: true,
    bestOf: 3,
    startsAt: Date.now() + 86_400_000,
    maxPlayers: 64,
  });
  tournamentId = created.body.id;
  matchId = randomUUID();
  await harness.store.pool.query(
    `INSERT INTO tournament_matches (id, tournament_id, round, position, player0_account_id, player1_account_id, status)
     VALUES ($1,$2,1,0,$3,$4,'pending')`,
    [matchId, tournamentId, accounts.alice, accounts.bob],
  );
}

beforeEach(async () => {
  harness = await startHarness();
  await seedMatch();
});

afterEach(async () => {
  await harness.close();
});

describe("POST /tournaments/:id/matches/:matchId/present", () => {
  it("starts the shared clock from the ruleset only once both players arrive", async () => {
    const first = await post(`/tournaments/${tournamentId}/matches/${matchId}/present`, "alice");
    expect(first.status).toBe(200);
    expect(first.body.series).toBeUndefined();
    expect(first.body.presentAt[0]).toBeGreaterThan(0);

    const second = await post(`/tournaments/${tournamentId}/matches/${matchId}/present`, "bob");
    expect(second.body.series.winsRequired).toBe(2);
    // 45 minutes of Swiss round time plus the snapshot's 5 minutes of overtime, from the frozen
    // bandai_general ruleset. The deadline is when the confrontation is DECIDED — manual §5.2 puts
    // that after the extra turns, not when the main clock stops.
    expect(second.body.series.seriesDeadlineAt - second.body.series.startedAt).toBe(2_700_000 + 300_000);
  });

  it("refuses somebody who is not in the pairing, and 404s an unknown match or tournament", async () => {
    expect((await post(`/tournaments/${tournamentId}/matches/${matchId}/present`, "carol")).status).toBe(403);
    expect((await post(`/tournaments/${tournamentId}/matches/${randomUUID()}/present`, "alice")).status).toBe(404);
    expect((await post(`/tournaments/${randomUUID()}/matches/${matchId}/present`, "alice")).status).toBe(404);
  });

  /**
   * The ruleset comes from the tournament in the URL, so the match had better be one of its own.
   * Otherwise anybody seated in a real match could create their own event with a best-of-one,
   * untimed preset and start the real series under those rules by arriving through it.
   */
  it("refuses a real match smuggled in under another tournament's ruleset", async () => {
    const attackerEvent = await post("/tournaments", "alice", {
      name: "Attacker Cup",
      startsAt: Date.now() + 86_400_000,
      maxPlayers: 8,
    });
    expect(attackerEvent.body.bestOf).toBe(1);

    const smuggled = await post(`/tournaments/${attackerEvent.body.id}/matches/${matchId}/present`, "alice");
    expect(smuggled.status).toBe(404);

    // The genuine route still starts the series under the real event's best-of-three, timed rules.
    await post(`/tournaments/${tournamentId}/matches/${matchId}/present`, "alice");
    const started = await post(`/tournaments/${tournamentId}/matches/${matchId}/present`, "bob");
    expect(started.body.series.winsRequired).toBe(2);
    expect(started.body.series.seriesDeadlineAt).not.toBeNull();
  });

  it("requires a session", async () => {
    const response = await fetch(`${harness.url}/tournaments/${tournamentId}/matches/${matchId}/present`, {
      method: "POST",
    });
    expect(response.status).toBe(401);
  });
});

describe("POST /series/:id/authorize-game", () => {
  async function startedSeries(): Promise<string> {
    await post(`/tournaments/${tournamentId}/matches/${matchId}/present`, "alice");
    return (await post(`/tournaments/${tournamentId}/matches/${matchId}/present`, "bob")).body.series.id;
  }

  it("hands each participant an authorization for the same first game", async () => {
    const seriesId = await startedSeries();
    const forAlice = await post(`/series/${seriesId}/authorize-game`, "alice");
    const forBob = await post(`/series/${seriesId}/authorize-game`, "bob");
    expect(forAlice.status).toBe(200);
    expect(forAlice.body).toMatchObject({ seriesId, matchId, tournamentId, gameIndex: 1 });
    expect(forAlice.body.participantAccountIds).toEqual([accounts.alice, accounts.bob]);
    expect(forBob.body.gameId).toBe(forAlice.body.gameId);
    // Two different tokens for the same game: neither player can lock the other out.
    expect(forBob.body.token).not.toBe(forAlice.body.token);
    expect(forAlice.body.expiresAt).toBeGreaterThan(Date.now());
  });

  it("refuses a second authorization while the caller's own is still live", async () => {
    const seriesId = await startedSeries();
    await post(`/series/${seriesId}/authorize-game`, "alice");
    const again = await post(`/series/${seriesId}/authorize-game`, "alice");
    expect(again.status).toBe(409);
    expect(again.body).toEqual({ error: "authorization_live" });
  });

  it("refuses a non-participant and 404s an unknown series", async () => {
    const seriesId = await startedSeries();
    expect((await post(`/series/${seriesId}/authorize-game`, "carol")).status).toBe(403);
    expect((await post(`/series/${randomUUID()}/authorize-game`, "alice")).status).toBe(404);
  });

  it("requires a session", async () => {
    const seriesId = await startedSeries();
    expect((await fetch(`${harness.url}/series/${seriesId}/authorize-game`, { method: "POST" })).status).toBe(401);
  });
});

describe("GET /tournaments/:id", () => {
  it("carries the series score alongside the bracket", async () => {
    const before = await get(`/tournaments/${tournamentId}`, "alice");
    expect(before.body.series).toEqual([
      {
        matchId,
        seriesId: null,
        status: "scheduled",
        participantIds: [null, null],
        winnerSeat: null,
        participant0Id: accounts.alice,
        participant1Id: accounts.bob,
        wins0: 0,
        wins1: 0,
        currentGameIndex: null,
        joinDeadlineAt: null,
        seriesDeadlineAt: null,
        winnerParticipantId: null,
        // A legacy bracket row was never paired by the Swiss pairer, so it has no reason to give.
        pairingReason: null,
      },
    ]);

    await post(`/tournaments/${tournamentId}/matches/${matchId}/present`, "alice");
    const awaiting = await get(`/tournaments/${tournamentId}`, "alice");
    expect(awaiting.body.series[0].status).toBe("awaiting_players");

    const seriesId = (await post(`/tournaments/${tournamentId}/matches/${matchId}/present`, "bob")).body.series.id;
    await post(`/series/${seriesId}/authorize-game`, "alice");
    const playing = await get(`/tournaments/${tournamentId}`, "alice");
    expect(playing.body.series[0]).toMatchObject({ seriesId, status: "playing", currentGameIndex: 1 });
    expect(playing.body.series[0].seriesDeadlineAt).toBeGreaterThan(Date.now());
  });
});
