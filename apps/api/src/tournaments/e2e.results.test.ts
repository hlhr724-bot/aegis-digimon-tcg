import { buildTournamentRules } from "#api/tournaments/rules/buildTournamentRules";
import type { AddressInfo } from "node:net";
import { Encoder } from "@colyseus/schema";
import type { ServerEvent } from "@aegis/shared";
import type { TournamentResultExport } from "@aegis/shared/tournaments/TournamentResultExport";
import type { Client } from "colyseus";
import express from "express";
import type { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountStore } from "#api/accounts/AccountStore";
import { installAccountRoutes } from "#api/accounts/routes";
import { snapshotFixtures } from "#api/db/snapshotFixture";
import { RED_DECK } from "#api/engine/testDecks";
import { AegisRoom, type AegisJoinOptions } from "#api/rooms/AegisRoom";
import { EliminationStore, type BracketView, type EliminationMatch } from "#api/tournaments/elimination/index";
import { ParticipantStore } from "#api/tournaments/participants/index";

import { TournamentResultStore } from "#api/tournaments/results/TournamentResultStore";
import { SeriesStore } from "#api/tournaments/series/index";
import { SwissProgram } from "#api/tournaments/swiss/index";
import "#api/cards/index";

const SERIES_DURATION_MS = buildTournamentRules({ bestOf: 1 }).match.topCutDurationMs ?? 25 * 60_000;
const START = Date.now();
const MAX_PASSES = 6;

type Harness = {
  url: string;
  organizerCookie: string;
  accounts: AccountStore;
  series: SeriesStore;
  swiss: SwissProgram;
  elimination: EliminationStore;
  close: () => Promise<void>;
};

let harness: Harness;
let rooms: ResultRoom[];

class ResultRoom extends AegisRoom {
  protected override series(): SeriesStore {
    return harness.series;
  }

  protected override accounts(): AccountStore {
    return harness.accounts;
  }
}

const harnessFor = snapshotFixtures<Harness>();

async function buildHarness(pool: Pool): Promise<Harness> {
  const accounts = new AccountStore(pool);
  const participants = new ParticipantStore(accounts);
  const series = new SeriesStore(accounts);
  const swiss = new SwissProgram(accounts, series);
  const elimination = new EliminationStore(accounts);
  series.addResolutionListener(({ matchId }) => swiss.onSeriesResolved(matchId).then(() => undefined));
  series.addResolutionListener(({ seriesId }) => elimination.onSeriesResolvedById(seriesId));
  const app = express();
  app.use(express.json());
  installAccountRoutes(app, accounts, participants, series, swiss, elimination);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const organizer = await accounts.accountForIdentity("discord", "organizer", "Organizer");
  const session = await accounts.issueSession(organizer);
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    organizerCookie: `aegis_session=${session.id}`,
    accounts,
    series,
    swiss,
    elimination,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function makeRoom(roomId: string): ResultRoom {
  const room = new ResultRoom();
  room.broadcast = vi.fn<() => boolean>(() => true) as AegisRoom["broadcast"];
  (room as unknown as { roomId: string }).roomId = roomId;
  room.onCreate({ seed: 7, botRoom: false, tournamentRoom: true });
  expect(new Encoder(room.state)).toBeInstanceOf(Encoder);
  rooms.push(room);
  return room;
}

async function send<T>(method: "GET" | "POST" | "PUT", path: string, cookie: string, body?: unknown): Promise<T> {
  const response = await fetch(`${harness.url}${path}`, {
    method,
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status >= 400) {
    throw new Error(`${method} ${path} → ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

async function signUp(name: string): Promise<{ accountId: string; cookie: string }> {
  const account = await harness.accounts.accountForIdentity("discord", name.toLowerCase(), name);
  const session = await harness.accounts.issueSession(account);
  return { accountId: account.id, cookie: `aegis_session=${session.id}` };
}

async function enter(tournamentId: string, cookie: string): Promise<void> {
  const deck = await send<{ id: string }>("PUT", "/account/decks", cookie, {
    name: "Competitive",
    mainDeck: [...RED_DECK.mainDeck],
    eggDeck: [...RED_DECK.eggDeck],
  });
  await send("POST", `/tournaments/${tournamentId}/participants`, cookie, { savedDeckId: deck.id });
  await send("POST", `/tournaments/${tournamentId}/check-in`, cookie);
}

function seatedAccounts(match: EliminationMatch): string[] {
  return match.seats.flatMap((seat) => (seat.accountId ? [seat.accountId] : []));
}

function joinOptions(gameId: string, token: string): AegisJoinOptions {
  return {
    displayName: "ignored",
    deck: { mainDeck: [], eggDeck: [] },
    tournamentGameId: gameId,
    tournamentGameToken: token,
  };
}

async function playMatch(tournamentId: string, match: EliminationMatch, now: number): Promise<void> {
  for (const accountId of seatedAccounts(match)) {
    await harness.series.markPresent({
      tournamentId,
      matchId: match.id,
      accountId,
      winsRequired: 1,
      seriesDurationMs: SERIES_DURATION_MS,
      now,
    });
  }
  const seriesRecord = await harness.series.seriesForMatch(match.id);
  if (!seriesRecord) {
    throw new Error(`match ${match.id} has no series`);
  }
  const room = makeRoom(`results-room-${rooms.length}`);
  for (const [index, accountId] of seatedAccounts(match).entries()) {
    const issued = await harness.series.authorizeNextGame({ seriesId: seriesRecord.id, accountId, now });
    if (!issued.ok) {
      throw new Error(`authorization failed: ${issued.reason}`);
    }
    const options = joinOptions(issued.value.gameId, issued.value.token);
    const client = {
      sessionId: `${match.id}-${index}`,
      send: vi.fn<() => void>(),
      view: undefined,
    } as unknown as Client;
    expect(await room.onAuth(client, options)).toBe(true);
    room.clients.push(client);
    room.onJoin(client, options);
  }
  const event: ServerEvent & { kind: "gameOver" } = {
    kind: "gameOver",
    result: { outcome: "win", winnerSeat: 0 },
    reason: "security",
  };
  await (
    room as unknown as { recordAuthoritativeResult: (gameOver: typeof event) => Promise<void> }
  ).recordAuthoritativeResult(event);
  room.onDispose();
}

beforeEach(async () => {
  rooms = [];
  harness = await harnessFor("default", buildHarness);
});

afterAll(async () => {
  await harness.close();
  await harness.accounts.close();
});

describe("a finished community cup", () => {
  it("saves one result export with every player", async () => {
    const created = await send<{ id: string }>("POST", "/tournaments", harness.organizerCookie, {
      name: "Weekly Cup",
      block: "BT10",
      startsAt: START + 30 * 60_000,
      maxPlayers: 4,
      structure: "single_elimination",
      bestOf: 1,
      allowBots: false,
    });
    for (const name of ["Alice", "Bruno", "Chiara", "Dmitri"]) {
      const person = await signUp(name);
      await enter(created.id, person.cookie);
    }
    const closed = await send<{ bracket: BracketView }>(
      "POST",
      `/tournaments/${created.id}/close-check-in`,
      harness.organizerCookie,
    );
    let bracket = closed.bracket;
    let now = START;
    for (let pass = 0; pass < MAX_PASSES && !bracket.championParticipantId; pass += 1) {
      for (const match of bracket.matches.filter((entry) => entry.status === "pending")) {
        await playMatch(created.id, match, now);
      }
      now += 60_000;
      bracket = (await harness.elimination.bracket(created.id))!;
    }
    expect(bracket.championParticipantId).not.toBeNull();

    const results = new TournamentResultStore(harness.accounts);
    const standings = (tournamentId: string) => harness.swiss.standings(tournamentId);
    expect(await results.sweepFinishedTournaments({ standings, now })).toBe(1);
    expect(await results.sweepFinishedTournaments({ standings, now: now + 60_000 })).toBe(0);

    const exports = await harness.accounts.pool.query("SELECT tournament_id FROM tournament_result_exports");
    expect(exports.rows).toEqual([{ tournament_id: created.id }]);

    const exported = await send<TournamentResultExport>(
      "GET",
      `/tournaments/${created.id}/export`,
      harness.organizerCookie,
    );
    expect(exported.schemaVersion).toBe(1);
    expect(exported.event).toMatchObject({ id: created.id, name: "Weekly Cup", structure: "single_elimination" });
    expect(exported.participants).toHaveLength(4);
    expect(exported.participants.every((participant) => participant.decklist?.mainDeck.length)).toBe(true);
    expect(exported.matches.filter((match) => !match.bye)).toHaveLength(3);
    expect(exported.participants[0]?.participantId).toBe(bracket.championParticipantId);
  }, 60_000);
});
