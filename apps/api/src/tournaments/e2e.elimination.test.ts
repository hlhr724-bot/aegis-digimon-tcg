import { buildTournamentRules } from "#api/tournaments/rules/buildTournamentRules";
import type { AddressInfo } from "node:net";
import { Encoder } from "@colyseus/schema";
import type { Seat, ServerEvent } from "@aegis/shared";
import type { Client } from "colyseus";
import express from "express";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountStore } from "../accounts/AccountStore.js";
import { installAccountRoutes } from "../accounts/routes.js";
import type { Pool } from "pg";
import { snapshotFixtures } from "../db/snapshotFixture.js";
import { RED_DECK } from "../engine/testDecks.js";
import { AegisRoom, type AegisJoinOptions } from "../rooms/AegisRoom.js";
import { ArbitrationService } from "./arbitration/index.js";
import { readTournamentEvents } from "./audit/index.js";
import {
  BotMatchDriver,
  BotSeatingStore,
  createBotMatchSweep,
  type BotRoomGateway,
  type BotSeatableRoom,
} from "./bots/index.js";
import { EliminationStore, type BracketView, type EliminationMatch } from "./elimination/index.js";
import { ParticipantStore } from "./participants/index.js";

import { SeriesStore } from "./series/index.js";
import { SwissProgram } from "./swiss/index.js";
import "../cards/index.js";

/**
 * One lightning cup, end to end: three people register over HTTP, a bot fills the fourth seat, and
 * the bracket is played to a champion.
 *
 * Every module in the slice is the real one — the HTTP surface, the participant/series/elimination
 * stores over pg-mem, the bot sweep, and `AegisRoom` itself. The only substitutions are the ones a
 * test has to make: the room gateway builds rooms without a matchmaker, and the clock is a `now`
 * value passed in rather than wall time, so the whole cup runs without waiting for anything.
 *
 * What it is here to catch is the wiring NO single-module test can see: the resolution listeners
 * that `tournaments/runtime.ts` registers are what carry a finished game into the next round, and a
 * test that builds its stores directly gets neither of them.
 */

const SERIES_DURATION_MS =
  buildTournamentRules({ bestOf: 1 }).match.topCutDurationMs ??
  buildTournamentRules({ bestOf: 1 }).match.finalDurationMs;
const WINS_REQUIRED = 1;
const MINUTE_MS = 60_000;
/**
 * Where the test's clock starts. Anchored to the real one rather than an arbitrary epoch: the
 * creation endpoint dates `startsAt` against the SERVER clock, and an authorization minted at a
 * fabricated `now` would read as long expired to the room that redeems it.
 */
const START = Date.now();
/** Each pass advances every open match by one step; three rounds of four seats needs far fewer. */
const MAX_PASSES = 12;

type Harness = {
  url: string;
  organizerCookie: string;
  accounts: AccountStore;
  series: SeriesStore;
  elimination: EliminationStore;
  sweep: (now: number) => Promise<number>;
  close: () => Promise<void>;
};

let harness: Harness;
let rooms: TestRoom[];

/** A room wired to the test's stores instead of the process singletons. */
class TestRoom extends AegisRoom {
  protected override series(): SeriesStore {
    return harness.series;
  }

  protected override accounts(): AccountStore {
    return harness.accounts;
  }
}

function makeRoom(roomId: string): TestRoom {
  const room = new TestRoom();
  room.broadcast = vi.fn<() => boolean>(() => true) as AegisRoom["broadcast"];
  (room as unknown as { roomId: string }).roomId = roomId;
  room.onCreate({ seed: 7, botRoom: false, tournamentRoom: true });
  // Production attaches the state to an Encoder before anybody joins; keeping that lifecycle here
  // means a detached schema node fails the test rather than passing it.
  // eslint-disable-next-line no-new -- constructing the Encoder wires the state root
  new Encoder(room.state);
  rooms.push(room);
  return room;
}

/** Hands back the room already bound to a game, or makes one. Mirrors the Colyseus gateway. */
function testGateway(): BotRoomGateway {
  return {
    async roomForGame({ gameId }): Promise<BotSeatableRoom | undefined> {
      const bound = (
        await harness.accounts.pool.query<{ room_id: string | null }>(
          "SELECT room_id FROM tournament_games WHERE id=$1",
          [gameId],
        )
      ).rows[0];
      const existing = bound?.room_id && rooms.find((room) => room.roomId === bound.room_id);
      return existing || makeRoom(`room-${rooms.length}`);
    },
  };
}

function fakeClient(sessionId: string): Client {
  return { sessionId, send: vi.fn<() => void>(), view: undefined } as unknown as Client;
}

function joinOptions(gameId: string, token: string): AegisJoinOptions {
  return {
    displayName: "ignored",
    // Whatever a client sends is discarded in favour of the frozen competitive deck.
    deck: { mainDeck: [], eggDeck: [] },
    tournamentGameId: gameId,
    tournamentGameToken: token,
  };
}

function reportGameOver(room: TestRoom, winnerSeat: Seat): Promise<void> {
  const event: ServerEvent & { kind: "gameOver" } = {
    kind: "gameOver",
    result: { outcome: "win", winnerSeat },
    reason: "security",
  };
  return (
    room as unknown as { recordAuthoritativeResult: (event: ServerEvent & { kind: "gameOver" }) => Promise<void> }
  ).recordAuthoritativeResult(event);
}

function seatOfClient(room: TestRoom, client: Client): Seat {
  const seat = (room as unknown as { seatByClient: Map<string, Seat> }).seatByClient.get(client.sessionId);
  if (seat === undefined) throw new Error("the client took no seat");
  return seat;
}

/**
 * One express server and one database for the file, restored to its just-started state before each
 * test. Standing the server up and re-migrating per test cost far more than the event under test.
 */
const harnessFor = snapshotFixtures<Harness>();

async function startHarness(): Promise<Harness> {
  return harnessFor("default", buildHarness);
}

async function buildHarness(pool: Pool): Promise<Harness> {
  const accounts = new AccountStore(pool);
  const participants = new ParticipantStore(accounts);
  const series = new SeriesStore(accounts);
  const swiss = new SwissProgram(accounts, series);
  const elimination = new EliminationStore(accounts);
  const bots = new BotSeatingStore(accounts);
  const arbitration = new ArbitrationService(accounts, participants, series, swiss, elimination);

  // The two listeners `tournaments/runtime.ts` registers. Without them a resolved confrontation
  // reaches nothing: the bracket never advances and the cup stops after its first game.
  series.addResolutionListener(({ matchId }) => swiss.onSeriesResolved(matchId).then(() => undefined));
  series.addResolutionListener(({ seriesId }) => elimination.onSeriesResolvedById(seriesId));

  const app = express();
  app.use(express.json());
  installAccountRoutes(app, accounts, participants, series, swiss, elimination, bots, undefined, arbitration);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));

  const organizer = await accounts.accountForIdentity("discord", "organizer", "Organizer");
  await accounts.pool.query("UPDATE accounts SET roles=ARRAY['admin'] WHERE id=$1", [organizer.id]);
  const session = await accounts.issueSession(organizer);
  const driver = new BotMatchDriver(accounts, series, testGateway(), {
    // A yield instead of a two-second pause: same decisions, no waiting.
    botOptions: { thinkDelay: () => Promise.resolve(), seed: 11 },
  });
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    organizerCookie: `aegis_session=${session.id}`,
    accounts,
    series,
    elimination,
    sweep: createBotMatchSweep({ accounts, driver: async () => driver }),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function send<T>(method: "POST" | "PUT", path: string, cookie: string, body?: unknown): Promise<T> {
  const response = await fetch(`${harness.url}${path}`, {
    method,
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status >= 400) throw new Error(`${method} ${path} → ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

/** A person with a session cookie. Identity creation is the one step that has no HTTP surface. */
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

/** Everyone in a match who has an account, and the cookie-free identity the series module wants. */
function humanSeats(match: EliminationMatch): { seat: 0 | 1; accountId: string }[] {
  return match.seats.flatMap((seat, index) =>
    seat.kind === "human" && seat.accountId ? [{ seat: index as 0 | 1, accountId: seat.accountId }] : [],
  );
}

function openMatches(bracket: BracketView): EliminationMatch[] {
  return bracket.matches.filter((match) => match.status === "pending");
}

/**
 * Plays out one confrontation between two people through a REAL room.
 *
 * Both seats redeem their own authorization and enter the room exactly as a client would; the game
 * is then closed by the same authoritative report the engine's `gameOver` reaches. Seat 0 is
 * declared the winner: WHO wins is arbitrary here, and playing the cards out is what the engine and
 * bot-driver suites already cover.
 */
async function playHumanMatch(match: EliminationMatch, now: number): Promise<void> {
  const seriesRecord = await harness.series.seriesForMatch(match.id);
  if (!seriesRecord) throw new Error(`match ${match.id} has no series`);
  const room = makeRoom(`human-room-${rooms.length}`);
  for (const [index, human] of humanSeats(match).entries()) {
    const issued = await harness.series.authorizeNextGame({
      seriesId: seriesRecord.id,
      accountId: human.accountId,
      now,
    });
    if (!issued.ok) throw new Error(`authorization failed: ${issued.reason}`);
    const options = joinOptions(issued.value.gameId, issued.value.token);
    const client = fakeClient(`${match.id}-${index}`);
    expect(await room.onAuth(client, options)).toBe(true);
    room.clients.push(client);
    room.onJoin(client, options);
  }
  await reportGameOver(room, 0);
  room.onDispose();
}

/**
 * Finishes a confrontation the bot sweep has already opened, with the person winning it.
 *
 * The bot is seated by the sweep and has bound the game to a room; the person joins that same room
 * on their own authorization, which is the whole point — a bot's seat is reached through the same
 * doors a person's is. Nothing here can be done until the sweep has run, so a match whose game is
 * not yet bound is simply left for the next pass.
 */
async function playBotMatch(match: EliminationMatch, now: number): Promise<boolean> {
  const seriesRecord = await harness.series.seriesForMatch(match.id);
  const game = seriesRecord?.games.find((candidate) => candidate.roomId && candidate.status !== "finished");
  const room = game && rooms.find((candidate) => candidate.roomId === game.roomId);
  if (!seriesRecord || !game || !room) return false;

  const human = humanSeats(match)[0];
  if (!human) throw new Error(`match ${match.id} has no person in it`);
  const issued = await harness.series.authorizeNextGame({
    seriesId: seriesRecord.id,
    accountId: human.accountId,
    now,
  });
  if (!issued.ok) throw new Error(`authorization failed: ${issued.reason}`);
  const options = joinOptions(issued.value.gameId, issued.value.token);
  const client = fakeClient(`${match.id}-human`);
  expect(await room.onAuth(client, options)).toBe(true);
  room.clients.push(client);
  room.onJoin(client, options);
  await reportGameOver(room, seatOfClient(room, client));
  room.onDispose();
  return true;
}

beforeEach(async () => {
  rooms = [];
  harness = await startHarness();
});
// The server and its database are shared for the file (see `harnessFor` above), so they are torn
// down once at the end rather than after each test.
afterAll(async () => {
  await harness.close();
  await harness.accounts.close();
});

describe("a lightning cup from registration to champion", () => {
  it("fills the short field with a bot, plays every round, and crowns one human champion", async () => {
    const created = await send<{ id: string }>("POST", "/tournaments", harness.organizerCookie, {
      name: "Lightning Cup",
      block: "BT10",
      startsAt: START + 30 * 60_000,
      maxPlayers: 4,
      structure: "single_elimination",
      bestOf: 1,
      allowBots: true,
    });

    const people = [];
    for (const name of ["Alice", "Bruno", "Chiara"]) {
      const person = await signUp(name);
      await enter(created.id, person.cookie);
      people.push(person);
    }

    const closed = await send<{ botsSeated: number; bracket: BracketView }>(
      "POST",
      `/tournaments/${created.id}/close-check-in`,
      harness.organizerCookie,
    );
    expect(closed.botsSeated).toBeGreaterThanOrEqual(1);
    expect(closed.bracket.size).toBe(4);
    expect(closed.bracket.matches).toHaveLength(3);

    let now = START;
    let bracket = closed.bracket;
    let botMatchesOpenedBySweep = 0;
    for (let pass = 0; pass < MAX_PASSES && !bracket.championParticipantId; pass += 1) {
      // A person arriving is what starts a confrontation; the sweep then finds the bot's seat
      // already waiting for it. Presence first, so one pass carries a bot match from empty to open.
      for (const match of openMatches(bracket))
        for (const human of humanSeats(match))
          await harness.series.markPresent({
            tournamentId: created.id,
            matchId: match.id,
            accountId: human.accountId,
            winsRequired: WINS_REQUIRED,
            seriesDurationMs: SERIES_DURATION_MS,
            now,
          });

      const roomsBeforeSweep = rooms.length;
      botMatchesOpenedBySweep += await harness.sweep(now);
      for (const room of rooms.slice(roomsBeforeSweep)) expect(room.autoDispose).toBe(false);

      for (const match of openMatches(bracket)) {
        const humans = humanSeats(match);
        if (humans.length === 2) await playHumanMatch(match, now);
        else await playBotMatch(match, now);
      }

      now += MINUTE_MS;
      bracket = (await harness.elimination.bracket(created.id))!;
    }

    expect(bracket.championParticipantId).not.toBeNull();
    // The bot's confrontations were opened by the sweep, not by the test reaching around it. Without
    // this the loop could have crowned a champion purely on the human bracket and still gone green.
    expect(botMatchesOpenedBySweep).toBeGreaterThan(0);
    expect(bracket.matches.every((match) => match.status === "finished" || match.status === "bye")).toBe(true);

    const winnerAccountId = (
      await harness.accounts.pool.query<{ winner_account_id: string | null }>(
        "SELECT winner_account_id FROM tournaments WHERE id=$1",
        [created.id],
      )
    ).rows[0]?.winner_account_id;
    expect(people.map((person) => person.accountId)).toContain(winnerAccountId);

    // A bot fills a seat; it never takes one. Every round that had a person in it sends a person on.
    const kinds = new Map<string, string>();
    for (const match of bracket.matches)
      for (const seat of match.seats) if (seat.participantId && seat.kind) kinds.set(seat.participantId, seat.kind);
    for (const round of new Set(bracket.matches.map((match) => match.round))) {
      const inRound = bracket.matches.filter((match) => match.round === round);
      const hadPerson = inRound.some((match) => humanSeats(match).length > 0);
      if (!hadPerson) continue;
      const winners = inRound.flatMap((match) => (match.winnerParticipantId ? [match.winnerParticipantId] : []));
      expect(winners.some((participantId) => kinds.get(participantId) === "human")).toBe(true);
    }
  }, 60_000);

  it("parks an elimination tie for a judge, then advances the bracket on the organizer's ruling", async () => {
    // The arbitration loop nothing else covers end to end: an elimination confrontation that runs
    // out of clock at 0-0 has no winner the server may invent — the manual's state tiebreak needs
    // metrics the room does not publish — so it parks in `needs_organizer_decision`, and the WHOLE
    // bracket stops there until a judge rules. This proves the way out actually reaches the bracket.
    const created = await send<{ id: string }>("POST", "/tournaments", harness.organizerCookie, {
      name: "Lightning Cup",
      block: "BT10",
      startsAt: START + 30 * 60_000,
      maxPlayers: 4,
      structure: "single_elimination",
      bestOf: 1,
      allowBots: false,
    });
    const people = new Map<string, { accountId: string; cookie: string }>();
    for (const name of ["Alice", "Bruno", "Chiara", "Dmitri"]) {
      const person = await signUp(name);
      await enter(created.id, person.cookie);
      people.set(person.accountId, person);
    }
    const closed = await send<{ bracket: BracketView }>(
      "POST",
      `/tournaments/${created.id}/close-check-in`,
      harness.organizerCookie,
    );
    const semifinals = openMatches(closed.bracket);
    expect(semifinals).toHaveLength(2);
    const [played, disputed] = semifinals as [EliminationMatch, EliminationMatch];

    // One semifinal is played out normally. The other starts and then runs out of clock at 0-0.
    for (const match of semifinals)
      for (const human of humanSeats(match))
        await harness.series.markPresent({
          tournamentId: created.id,
          matchId: match.id,
          accountId: human.accountId,
          winsRequired: WINS_REQUIRED,
          seriesDurationMs: SERIES_DURATION_MS,
          now: START,
        });
    await playHumanMatch(played, START);

    const parkedSeries = (await harness.series.seriesForMatch(disputed.id))!;
    // The command the deadline worker issues when a series' shared clock expires.
    const timedOut = await harness.series.resolveSeriesByDeadline({
      seriesId: parkedSeries.id,
      policy: { kind: "elimination" },
      now: parkedSeries.seriesDeadlineAt! + 1,
    });
    expect(timedOut.ok && timedOut.value.status).toBe("needs_organizer_decision");
    expect(timedOut.ok && timedOut.value.officialResult).toBeNull();

    // The bracket is genuinely stuck: one semifinal is decided, the final has an empty seat, and
    // nothing advances on its own.
    let bracket = (await harness.elimination.bracket(created.id))!;
    expect(bracket.championParticipantId).toBeNull();
    const finalBefore = bracket.matches.find((match) => match.round === 2)!;
    expect(finalBefore.seats.filter((seat) => seat.participantId !== null)).toHaveLength(1);

    // ── The judge rules, over HTTP, as the organizer ────────────────────────────────────────────
    const ruledFor = humanSeats(disputed)[0]!.accountId;
    const ruling = await send<{ reasonCode: string; alreadyApplied: boolean }>(
      "POST",
      `/tournaments/${created.id}/arbitration/series/${parkedSeries.id}/decide`,
      harness.organizerCookie,
      { winnerAccountId: ruledFor, reason: "judge awarded the match on the state tiebreak" },
    );
    expect(ruling.reasonCode).toBe("organizer_winner");

    // The ruling reaches the bracket through the SAME resolution listener a played-out match uses.
    bracket = (await harness.elimination.bracket(created.id))!;
    const final = bracket.matches.find((match) => match.round === 2)!;
    expect(final.seats.filter((seat) => seat.participantId !== null)).toHaveLength(2);

    // ── And the event finishes normally from there ──────────────────────────────────────────────
    for (const human of humanSeats(final))
      await harness.series.markPresent({
        tournamentId: created.id,
        matchId: final.id,
        accountId: human.accountId,
        winsRequired: WINS_REQUIRED,
        seriesDurationMs: SERIES_DURATION_MS,
        now: START + MINUTE_MS,
      });
    await playHumanMatch(final, START + MINUTE_MS);

    bracket = (await harness.elimination.bracket(created.id))!;
    expect(bracket.championParticipantId).not.toBeNull();
    const winnerAccountId = (
      await harness.accounts.pool.query<{ winner_account_id: string | null }>(
        "SELECT winner_account_id FROM tournaments WHERE id=$1",
        [created.id],
      )
    ).rows[0]?.winner_account_id;
    expect([...people.keys()]).toContain(winnerAccountId);

    // The judge's decision is in the trail, named, with the account that made it.
    const events = await readTournamentEvents(harness.accounts.pool, created.id);
    const decided = events.filter((event) => event.command === "decide_series");
    expect(decided).toHaveLength(1);
    expect(decided[0]).toMatchObject({ actorKind: "organizer", seriesId: parkedSeries.id });
    expect(events.map((event) => event.sequence)).toEqual(events.map((_event, index) => index + 1));
  }, 60_000);

  it("records the bot fill in an audit trail with no gaps and no unexplained entries", async () => {
    const created = await send<{ id: string }>("POST", "/tournaments", harness.organizerCookie, {
      name: "Lightning Cup",
      block: "BT10",
      startsAt: START + 30 * 60_000,
      maxPlayers: 4,
      structure: "single_elimination",
      bestOf: 1,
      allowBots: true,
    });
    for (const name of ["Alice", "Bruno", "Chiara"]) await enter(created.id, (await signUp(name)).cookie);
    const closed = await send<{ botsSeated: number }>(
      "POST",
      `/tournaments/${created.id}/close-check-in`,
      harness.organizerCookie,
    );

    const events = await readTournamentEvents(harness.accounts.pool, created.id);
    const botFill = events.find((event) => event.command === "bot_fill");
    expect(botFill?.after).toEqual({ seatedBots: closed.botsSeated });
    expect(events.map((event) => event.sequence)).toEqual(events.map((_event, index) => index + 1));
    for (const event of events) expect(event.reason.trim()).not.toBe("");
  });
});
