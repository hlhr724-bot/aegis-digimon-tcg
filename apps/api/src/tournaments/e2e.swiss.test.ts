import { buildTournamentRules } from "#api/tournaments/rules/buildTournamentRules";
import type { AddressInfo } from "node:net";
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
import { readTournamentEvents, type TournamentEvent } from "./audit/index.js";
import { BotSeatingStore } from "./bots/index.js";
import { EliminationStore } from "./elimination/index.js";
import { ParticipantStore } from "./participants/index.js";

import { DeadlineScheduler } from "./scheduler/index.js";
import { SeriesStore } from "./series/index.js";
import { SwissProgram } from "./swiss/index.js";
import { TopCutProgram } from "./topcut/index.js";

/**
 * One official Swiss event, end to end, over the real HTTP surface and through real rooms.
 *
 * What makes this an E2E rather than a bigger integration test is that nothing is stubbed on the
 * path a player takes: the deck is saved and the entry made over HTTP, presence is asserted over
 * HTTP, the games are played by an actual {@link AegisRoom} reporting an actual authoritative
 * result, the no-show is settled by the actual deadline scheduler, and the disputed confrontation is
 * settled by the actual arbitration command. The substitutions are the database (pg-mem) and the
 * clock — and the clock is substituted by passing instants as VALUES, never by faking timers, so the
 * test asserts the exact boundaries the ruleset names instead of waiting for them.
 *
 * Three shortcuts, all disclosed rather than hidden:
 *
 *  1. **Sign-in is not over HTTP.** Sessions are minted through the store, because the magic-link
 *     flow needs an email provider and the Discord flow an OAuth round trip. Everything a signed-in
 *     player then does — the deck, the entry, the check-in, presence, the concession — goes over the
 *     wire under that cookie, so the authorization path each endpoint enforces is the real one.
 *  2. **The attendance ladder is armed by the test**, because round publication does not arm it yet.
 *  3. **Rounds 2 and 3 are mostly conceded** rather than played in rooms, to reach the champion
 *     without twenty more room boots. Round 1 covers the room path.
 *
 * The second case below runs the same surface with `topCut: true` over the smallest field the
 * official table cuts at all, so the Swiss-to-cut transition, the bracket and its champion are
 * covered by the same end-to-end path rather than only by the unit suite.
 */

const PLAYERS = ["alice", "bob", "carol", "dave", "erin", "frank", "grace", "heidi", "ivan"] as const;
/** The eight-player field the no-cut case runs; the cut case uses all nine. */
const SWISS_PLAYERS = PLAYERS.slice(0, 8);

let accounts: AccountStore;
let series: SeriesStore;
let participants: ParticipantStore;
let swiss: SwissProgram;
let elimination: EliminationStore;
let topCut: TopCutProgram;
let arbitration: ArbitrationService;
let scheduler: DeadlineScheduler;
let url: string;
let close: () => Promise<void>;
let cookieOf: Map<string, string>;
let tournamentId: string;
let roomCounter = 0;

/** A room wired to the test's stores instead of the process singletons. */
class TournamentTestRoom extends AegisRoom {
  protected override series(): SeriesStore {
    return series;
  }
  protected override accounts(): AccountStore {
    return accounts;
  }
}

// oxlint-disable-next-line typescript/no-explicit-any -- a wire body is untyped by definition
type Wire = any;

async function request(
  method: "GET" | "POST" | "PUT",
  path: string,
  as: string,
  body?: unknown,
): Promise<{ status: number; body: Wire }> {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookieOf.get(as) ?? "" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = response.headers.get("content-type")?.includes("application/json");
  return { status: response.status, body: json ? await response.json() : null };
}

function fakeClient(sessionId: string): Client {
  return { sessionId, send: vi.fn<() => void>(), view: undefined } as unknown as Client;
}

function makeRoom(): TournamentTestRoom {
  const room = new TournamentTestRoom();
  room.broadcast = vi.fn<() => boolean>(() => true) as AegisRoom["broadcast"];
  roomCounter += 1;
  (room as unknown as { roomId: string }).roomId = `e2e-room-${roomCounter}`;
  room.onCreate({ seed: 1, botRoom: false, tournamentRoom: true });
  return room;
}

function joinOptions(gameId: string, token: string): AegisJoinOptions {
  // Whatever a client claims about its name and deck is ignored; the authorization decides both.
  return {
    displayName: "ignored",
    deck: { mainDeck: [], eggDeck: [] },
    tournamentGameId: gameId,
    tournamentGameToken: token,
  };
}

function reportGameOver(room: TournamentTestRoom, winnerSeat: Seat): Promise<void> {
  const event: ServerEvent & { kind: "gameOver" } = {
    kind: "gameOver",
    result: { outcome: "win", winnerSeat },
    reason: "security",
  };
  return (
    room as unknown as { recordAuthoritativeResult: (e: typeof event) => Promise<void> }
  ).recordAuthoritativeResult(event);
}

/**
 * Plays one game of a confrontation in a real room: both seats authorize, both enter, the room
 * reports one authoritative result. Seats are entered in participant order, so the room's seat index
 * and the series' participant index are the same number.
 */
async function playGame(seriesId: string, seats: [string, string], winnerSeat: Seat): Promise<void> {
  const room = makeRoom();
  for (const [index, accountId] of seats.entries()) {
    const issued = await series.authorizeNextGame({ seriesId, accountId });
    if (!issued.ok) throw new Error(`authorization failed for seat ${index}: ${issued.reason}`);
    const options = joinOptions(issued.value.gameId, issued.value.token);
    const client = fakeClient(`session-${index}`);
    expect(await room.onAuth(client, options)).toBe(true);
    room.clients.push(client);
    room.onJoin(client, options);
  }
  await reportGameOver(room, winnerSeat);
  room.onDispose();
}

/** Both players arrive over HTTP, which is what starts the shared clock. */
async function bothPresent(matchId: string, seats: [string, string]): Promise<string> {
  for (const accountId of seats) {
    const response = await request("POST", `/tournaments/${tournamentId}/matches/${matchId}/present`, accountId);
    expect(response.status).toBe(200);
  }
  const record = await series.seriesForMatch(matchId);
  if (!record) throw new Error("presence did not start a series");
  return record.id;
}

type OpenMatch = { matchId: string; seats: [string, string] };

async function openMatches(): Promise<OpenMatch[]> {
  return (await series.scoreViews(tournamentId))
    .filter((view) => view.participant0Id && view.participant1Id && view.status !== "resolved")
    .map((view) => ({
      matchId: view.matchId,
      seats: [view.participant0Id!, view.participant1Id!] as [string, string],
    }));
}

async function joinDeadlineOf(matchId: string): Promise<number | null> {
  const row = (
    await accounts.pool.query<{ join_deadline_at: string | null }>(
      "SELECT join_deadline_at FROM tournament_matches WHERE id=$1",
      [matchId],
    )
  ).rows[0];
  return row?.join_deadline_at === null || row?.join_deadline_at === undefined ? null : Number(row.join_deadline_at);
}

/** The origin every attendance penalty is measured from: the instant the round was published. */
async function attendanceBase(matchId: string): Promise<number> {
  return (await joinDeadlineOf(matchId))! - buildTournamentRules({ bestOf: 3 }).attendance.joinGraceMs;
}

type Fixture = {
  accounts: AccountStore;
  participants: ParticipantStore;
  series: SeriesStore;
  swiss: SwissProgram;
  elimination: EliminationStore;
  topCut: TopCutProgram;
  arbitration: ArbitrationService;
  scheduler: DeadlineScheduler;
  url: string;
  close: () => Promise<void>;
  cookieOf: Map<string, string>;
};

/**
 * One express server and one database for the file, restored to its just-started state before each
 * test. Assigns the module-level bindings rather than shadowing them: the helpers below read them.
 */
const fixtureFor = snapshotFixtures<Fixture>();

async function buildFixture(pool: Pool): Promise<Fixture> {
  accounts = new AccountStore(pool);
  participants = new ParticipantStore(accounts);
  series = new SeriesStore(accounts);
  swiss = new SwissProgram(accounts, series);
  elimination = new EliminationStore(accounts);
  topCut = new TopCutProgram(accounts, elimination);
  arbitration = new ArbitrationService(accounts, participants, series, swiss, elimination);
  scheduler = new DeadlineScheduler(accounts, series);
  // The two listeners `runtime.ts` registers in production. Without them a resolution never reaches
  // the round close, and the event would stall for a reason that has nothing to do with the test.
  series.addResolutionListener(async ({ matchId, tournamentId: id }) => {
    const closed = await swiss.onSeriesResolved(matchId);
    // The same follow-on `runtime.ts` performs: the last Swiss round parks its phase in `frozen`,
    // and cutting straight away is what makes the bracket appear without waiting for a sweep.
    if (closed.ok && closed.value.kind === "phase_frozen_for_top_cut") await topCut.startTopCut(id);
  });
  series.addResolutionListener(({ seriesId }) => elimination.onSeriesResolvedById(seriesId));

  const app = express();
  app.use(express.json());
  installAccountRoutes(
    app,
    accounts,
    participants,
    series,
    swiss,
    elimination,
    new BotSeatingStore(accounts),
    topCut,
    arbitration,
  );
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise<void>((resolve) => server.close(() => resolve()));

  cookieOf = new Map();
  const organizer = await accounts.accountForIdentity("discord", "organizer", "Organizer");
  await accounts.pool.query("UPDATE accounts SET roles=ARRAY['admin'] WHERE id=$1", [organizer.id]);
  cookieOf.set("organizer", `aegis_session=${(await accounts.issueSession(organizer)).id}`);
  for (const name of PLAYERS) {
    const account = await accounts.accountForIdentity("discord", name, name);
    // Keyed by account id as well as by name: the pairer decides who sits where, so a test acting as
    // "whoever holds seat 0" has only the account id to go on.
    const cookie = `aegis_session=${(await accounts.issueSession(account)).id}`;
    cookieOf.set(name, cookie);
    cookieOf.set(account.id, cookie);
  }
  return { accounts, participants, series, swiss, elimination, topCut, arbitration, scheduler, url, close, cookieOf };
}

beforeEach(async () => {
  ({ accounts, participants, series, swiss, elimination, topCut, arbitration, scheduler, url, close, cookieOf } =
    await fixtureFor("default", buildFixture));
  roomCounter = 0;
});

// The server and its database are shared for the file (see `fixtureFor` above), so they are torn
// down once at the end rather than after each test.
afterAll(async () => {
  await close();
  await accounts.close();
});

describe("a full official Swiss event", () => {
  it("runs from creation to a champion, and its whole trail replays the outcome", async () => {
    // ── Creation ────────────────────────────────────────────────────────────────────────────
    const created = await request("POST", "/tournaments", "organizer", {
      name: "Regional Qualifier",
      structure: "swiss",
      bestOf: 3,
      topCut: false,
      startsAt: Date.now() + 30 * 60_000,
      maxPlayers: 8,
      banlist: { mode: "current" },
    });
    expect(created.status).toBe(201);
    tournamentId = created.body.id;

    // ── Entry and check-in, every step over HTTP ────────────────────────────────────────────
    for (const name of SWISS_PLAYERS) {
      const deck = await request("PUT", "/account/decks", name, {
        name: "Competitive",
        mainDeck: [...RED_DECK.mainDeck],
        eggDeck: [...RED_DECK.eggDeck],
      });
      expect(deck.status).toBe(200);
      expect(
        (await request("POST", `/tournaments/${tournamentId}/participants`, name, { savedDeckId: deck.body.id }))
          .status,
      ).toBe(201);
      expect((await request("POST", `/tournaments/${tournamentId}/check-in`, name)).status).toBe(200);
    }

    // ── Close: the field freezes and round 1 publishes with its deadlines ───────────────────
    const closed = await request("POST", `/tournaments/${tournamentId}/close-check-in`, "organizer");
    expect(closed.status).toBe(200);
    expect(closed.body.phase.rounds).toHaveLength(1);
    const roundOne = await openMatches();
    expect(roundOne).toHaveLength(4);
    // Every published confrontation carries the instant its players must have arrived by.
    for (const match of roundOne) expect(await joinDeadlineOf(match.matchId)).not.toBeNull();

    // ── Round 1, played four different ways ─────────────────────────────────────────────────
    const [twoNil, twoOne, noShow, disputed] = roundOne as [OpenMatch, OpenMatch, OpenMatch, OpenMatch];

    // Arming the attendance ladder is the round publisher's job in production and is not yet
    // wired there (`DeadlineScheduler.enqueueJoinDeadline` has no production caller in this tree).
    // The E2E arms it explicitly, and only for the confrontation whose absentee it is about to
    // judge, so the assertions below count that ladder's rungs and nothing else. When publication
    // arms every match, this call is what becomes redundant.
    await scheduler.enqueueJoinDeadline({
      tournamentId,
      matchId: noShow.matchId,
      dueAt: (await joinDeadlineOf(noShow.matchId))!,
      now: Date.now(),
    });

    // 2-0 through real rooms.
    const cleanSweep = await bothPresent(twoNil.matchId, twoNil.seats);
    await playGame(cleanSweep, twoNil.seats, 0);
    await playGame(cleanSweep, twoNil.seats, 0);
    expect((await series.series(cleanSweep))?.wins).toEqual([2, 0]);
    expect((await series.series(cleanSweep))?.officialResult).toBe("participant0");
    // Each game really was played in its own room; nothing here took a shortcut past AegisRoom.
    expect((await series.series(cleanSweep))?.games.map((game) => game.roomId)).toEqual(["e2e-room-1", "e2e-room-2"]);

    // 2-1 through real rooms, on the one clock the first game started.
    const threeGames = await bothPresent(twoOne.matchId, twoOne.seats);
    const startedAt = (await series.series(threeGames))!.seriesDeadlineAt;
    await playGame(threeGames, twoOne.seats, 1);
    await playGame(threeGames, twoOne.seats, 0);
    await playGame(threeGames, twoOne.seats, 1);
    expect((await series.series(threeGames))?.wins).toEqual([1, 2]);
    expect((await series.series(threeGames))?.officialResult).toBe("participant1");
    // The clock never moved between games; that is the BO3 invariant.
    expect((await series.series(threeGames))?.seriesDeadlineAt).toBe(startedAt);

    // A no-show, settled by the scheduler at the exact instants the ruleset names.
    expect(
      (await request("POST", `/tournaments/${tournamentId}/matches/${noShow.matchId}/present`, noShow.seats[0])).status,
    ).toBe(200);
    const base = await attendanceBase(noShow.matchId);
    // A null game-loss step means a ruleset that goes straight to the match loss; the official
    // preset has both rungs, and the two-step ladder is precisely what this asserts.
    expect(buildTournamentRules({ bestOf: 3 }).attendance.gameLossAtMs).not.toBeNull();
    const gameLossAt = base + buildTournamentRules({ bestOf: 3 }).attendance.gameLossAtMs!;
    const matchLossAt = base + buildTournamentRules({ bestOf: 3 }).attendance.matchLossAtMs;
    expect(await scheduler.processDueDeadlines(gameLossAt - 1)).toBe(0);
    expect(await scheduler.processDueDeadlines(gameLossAt)).toBe(1);
    expect((await series.seriesForMatch(noShow.matchId))?.wins).toEqual([1, 0]);
    expect(await scheduler.processDueDeadlines(matchLossAt - 1)).toBe(0);
    expect(await scheduler.processDueDeadlines(matchLossAt)).toBe(1);
    expect((await series.seriesForMatch(noShow.matchId))?.officialResult).toBe("participant0");

    // A confrontation the server may not decide for itself, parked exactly as an unresolvable
    // double no-show or a voided series leaves it — and therefore a round that cannot close.
    const parked = await series.resolveSeriesAdministratively({
      tournamentId,
      matchId: disputed.matchId,
      reason: "double_no_show_needs_organizer_decision",
      winsRequired: 2,
      seriesDurationMs: null,
      outcome: { status: "needs_organizer_decision", officialResult: null },
    });
    expect(parked.ok && parked.value.status).toBe("needs_organizer_decision");
    expect(await swiss.sweepOpenTournaments()).toBe(0);
    expect((await request("GET", `/tournaments/${tournamentId}`, "organizer")).body.phases[0].rounds).toHaveLength(1);

    // ── Arbitration unblocks it, and the round closes through the normal path ────────────────
    const decided = await request(
      "POST",
      `/tournaments/${tournamentId}/arbitration/series/${(parked as { value: { id: string } }).value.id}/decide`,
      "organizer",
      { winnerAccountId: disputed.seats[0], reason: "opponent forfeited to the judge before the round" },
    );
    expect(decided.status).toBe(200);
    expect(decided.body.reasonCode).toBe("organizer_winner");
    const afterRoundOne = await request("GET", `/tournaments/${tournamentId}`, "organizer");
    expect(afterRoundOne.body.phases[0].rounds).toHaveLength(2);

    // ── Standings are a projection of the ledger, and say so ─────────────────────────────────
    const standings = afterRoundOne.body.standings as { points: number; wins: number }[];
    expect(standings).toHaveLength(8);
    expect(standings.filter((row) => row.points === 3)).toHaveLength(4);
    expect(standings.filter((row) => row.points === 0)).toHaveLength(4);

    // ── Rounds 2 and 3 ──────────────────────────────────────────────────────────────────────
    // Round 2 keeps one confrontation on the real rooms, so the room path is exercised on a round
    // the pairer produced rather than only on the one the phase opened with. The rest are
    // conceded, which is a real command over the real route and reaches the champion without
    // twenty more room boots.
    for (let round = 2; round <= 3; round += 1) {
      const pending = await openMatches();
      expect(pending.length).toBeGreaterThan(0);
      for (const [index, match] of pending.entries()) {
        if (round === 2 && index === 0) {
          const seriesId = await bothPresent(match.matchId, match.seats);
          await playGame(seriesId, match.seats, 0);
          await playGame(seriesId, match.seats, 0);
          continue;
        }
        const conceded = await request(
          "POST",
          `/tournaments/${tournamentId}/arbitration/matches/${match.matchId}/concede`,
          match.seats[1],
          { reason: "cannot continue the event" },
        );
        expect(conceded.status).toBe(200);
      }
    }

    // ── One champion ────────────────────────────────────────────────────────────────────────
    const finished = await accounts.tournament(tournamentId);
    expect(finished?.status).toBe("finished");
    expect(finished?.winnerAccountId).not.toBeNull();
    const final = await request("GET", `/tournaments/${tournamentId}`, "organizer");
    expect(final.body.phases[0].status).toBe("finished");
    expect(final.body.phases[0].rounds).toHaveLength(3);
    // No cut was configured, so the Swiss phase IS the event and finishing it finishes the
    // tournament. The `topCut: true` case below is where the phase parks in `frozen` instead.
    expect(final.body.topCutEnabled).toBe(false);
    expect(replayTournament(await readTournamentEvents(accounts.pool, tournamentId)).topCut).toBeNull();

    // The champion is the leader of the final standings AND still in the event: a player who
    // dropped or was thrown out cannot be crowned by having left early enough.
    const finalStandings = final.body.standings as { participantId: string; points: number }[];
    const roster = await participants.participants(tournamentId);
    const crowned = roster.find((entry) => entry.accountId === finished!.winnerAccountId);
    expect(crowned?.status).toBe("active");
    expect(finalStandings[0]?.participantId).toBe(crowned?.id);

    // ── The trail is complete and replays the outcome ────────────────────────────────────────
    const trail = await readTournamentEvents(accounts.pool, tournamentId);
    expect(trail.map((event) => event.sequence)).toEqual(trail.map((_, index) => index + 1));
    expect(trail.every((event) => event.reason.trim().length > 0)).toBe(true);
    expect(trail.every((event) => event.reasonCode.trim().length > 0)).toBe(true);
    // Every kind of actor is in the one trail: what a machine did, what a scheduler decided, what
    // an organizer ruled, and what a player asked for.
    expect(new Set(trail.map((event) => event.actorKind))).toEqual(
      new Set(["system", "scheduler", "organizer", "participant"]),
    );
    expect(trail.filter((event) => event.command === "administrative_loss")).toHaveLength(2);
    expect(trail.filter((event) => event.command === "decide_series")).toHaveLength(1);

    // ── The replay ───────────────────────────────────────────────────────────────────────────
    // Rebuild the tournament from the EVENTS ALONE, then compare with the database. Nothing below
    // reads a table to build `replayed` — that is the point. If any resolution, publication or
    // completion stopped being recorded, the reconstruction loses it and one of these fails.
    const replayed = replayTournament(trail);

    // Rounds: the trail knows how many were published and closed.
    const rounds = await accounts.pool.query<{ id: string; number: number | string; status: string }>(
      `SELECT r.id, r.number, r.status FROM tournament_rounds r
           JOIN tournament_phases p ON p.id = r.phase_id
          WHERE p.tournament_id=$1 ORDER BY r.number`,
      [tournamentId],
    );
    expect([...replayed.publishedRounds].sort()).toEqual(rounds.rows.map((row) => Number(row.number)).sort());
    expect([...replayed.closedRounds].sort()).toEqual(
      rounds.rows
        .filter((row) => row.status === "closed")
        .map((row) => Number(row.number))
        .sort(),
    );

    // Confrontations: EVERY resolved series in the database must be reconstructible, with the same
    // official result. A missing `series_resolved` event fails here rather than passing quietly.
    const resolvedInDatabase = (
      await accounts.pool.query<{ id: string; official_result: string | null }>(
        `SELECT s.id, s.official_result FROM match_series s
           JOIN tournament_matches m ON m.id = s.tournament_match_id
          WHERE m.tournament_id=$1 AND s.status='resolved'`,
        [tournamentId],
      )
    ).rows;
    expect(resolvedInDatabase.length).toBeGreaterThan(0);
    for (const row of resolvedInDatabase) {
      expect(replayed.seriesResults.get(row.id)).toBe(row.official_result);
    }
    expect(replayed.seriesResults.size).toBe(resolvedInDatabase.length);

    // The champion, from the trail alone.
    expect(replayed.winnerAccountId).toBe(finished?.winnerAccountId);
    expect(replayed.finished).toBe(true);

    // No decklists and no tokens reached the ledger.
    const serialized = JSON.stringify(trail);
    expect(serialized).not.toContain(RED_DECK.mainDeck[0]);
    expect(serialized).not.toContain("aegis_session");
  }, 120_000);
});

describe("a full official Swiss event that cuts", () => {
  it("freezes the Swiss phase, draws a Top 2 through real rooms, and crowns the bracket's champion", async () => {
    // Nine is the smallest field the official table cuts at all (9–16 → Top 2) and it plays four
    // Swiss rounds, so this is the cheapest arrangement that exercises the real transition.
    const created = await request("POST", "/tournaments", "organizer", {
      name: "Regional Qualifier with a Cut",
      structure: "swiss",
      bestOf: 3,
      topCut: true,
      startsAt: Date.now() + 30 * 60_000,
      maxPlayers: PLAYERS.length,
      banlist: { mode: "current" },
    });
    expect(created.status).toBe(201);
    tournamentId = created.body.id;

    for (const name of PLAYERS) {
      const deck = await request("PUT", "/account/decks", name, {
        name: "Competitive",
        mainDeck: [...RED_DECK.mainDeck],
        eggDeck: [...RED_DECK.eggDeck],
      });
      expect(deck.status).toBe(200);
      expect(
        (await request("POST", `/tournaments/${tournamentId}/participants`, name, { savedDeckId: deck.body.id }))
          .status,
      ).toBe(201);
      expect((await request("POST", `/tournaments/${tournamentId}/check-in`, name)).status).toBe(200);
    }

    const closed = await request("POST", `/tournaments/${tournamentId}/close-check-in`, "organizer");
    expect(closed.status).toBe(200);
    expect(closed.body.phase.plannedRounds).toBe(4);

    // ── Four Swiss rounds ───────────────────────────────────────────────────────────────────
    // The first confrontation of round 1 goes through real rooms; an odd field means one bye per
    // round, which the pairer awards and ledgers without anybody turning up for it.
    for (let round = 1; round <= 4; round += 1) {
      const pending = await openMatches();
      expect(pending).toHaveLength(4);
      for (const [index, match] of pending.entries()) {
        if (round === 1 && index === 0) {
          const seriesId = await bothPresent(match.matchId, match.seats);
          await playGame(seriesId, match.seats, 0);
          await playGame(seriesId, match.seats, 0);
          continue;
        }
        const conceded = await request(
          "POST",
          `/tournaments/${tournamentId}/arbitration/matches/${match.matchId}/concede`,
          match.seats[1],
          { reason: "cannot continue the event" },
        );
        expect(conceded.status).toBe(200);
      }
    }

    // ── The cut, drawn by the same listener production registers ────────────────────────────
    const afterSwiss = await request("GET", `/tournaments/${tournamentId}`, "organizer");
    expect(afterSwiss.body.topCutEnabled).toBe(true);
    expect(afterSwiss.body.topCutSize).toBe(2);
    const swissPhase = afterSwiss.body.phases.find((phase: Wire) => phase.kind === "swiss");
    const cutPhase = afterSwiss.body.phases.find((phase: Wire) => phase.kind === "top_cut");
    // The Swiss phase ended by being CUT, not by crowning anybody.
    expect(swissPhase.status).toBe("finished");
    expect(swissPhase.rounds).toHaveLength(4);
    expect(cutPhase.status).toBe("running");
    expect(cutPhase.rounds).toHaveLength(1);
    expect(cutPhase.rounds[0].matches).toHaveLength(1);
    // The published standings are the FROZEN ones now, and the two seeded players lead them.
    const frozenStandings = afterSwiss.body.standings as { participantId: string }[];
    expect(frozenStandings).toHaveLength(PLAYERS.length);

    // ── The final, in a real room ────────────────────────────────────────────────────────────
    const finals = await openMatches();
    expect(finals).toHaveLength(1);
    const final = finals[0]!;
    const finalSeries = await bothPresent(final.matchId, final.seats);
    await playGame(finalSeries, final.seats, 0);
    await playGame(finalSeries, final.seats, 0);

    const finished = await accounts.tournament(tournamentId);
    expect(finished?.status).toBe("finished");
    expect(finished?.winnerAccountId).toBe(final.seats[0]);
    const roster = await participants.participants(tournamentId);
    const champion = roster.find((entry) => entry.accountId === finished!.winnerAccountId)!;
    expect(champion.status).toBe("active");
    expect((await elimination.bracket(tournamentId))?.championParticipantId).toBe(champion.id);

    // ── The trail reconstructs THAT a cut was drawn, and with which seeds ────────────────────
    const trail = await readTournamentEvents(accounts.pool, tournamentId);
    expect(trail.map((event) => event.sequence)).toEqual(trail.map((_, index) => index + 1));
    expect(trail.filter((event) => event.command === "top_cut_started")).toHaveLength(1);

    const replayed = replayTournament(trail);
    expect(replayed.topCut).toEqual({
      phaseId: cutPhase.id,
      topCutSize: 2,
      seededParticipantIds: [frozenStandings[0]!.participantId, frozenStandings[1]!.participantId],
    });
    // The seeds the trail names are exactly the two the bracket seated, and the champion is one
    // of them — a cut whose winner was not seeded would be a bracket drawn from something else.
    expect(replayed.topCut!.seededParticipantIds).toContain(champion.id);
    expect(replayed.finished).toBe(true);
    expect(replayed.winnerAccountId).toBe(finished?.winnerAccountId);
    // No decklists and no tokens reached the ledger.
    const serialized = JSON.stringify(trail);
    expect(serialized).not.toContain(RED_DECK.mainDeck[0]);
    expect(serialized).not.toContain("aegis_session");
  }, 120_000);
});

type ReplayedTournament = {
  publishedRounds: Set<number>;
  closedRounds: Set<number>;
  /** Series id to its official result. A later event for the same series supersedes an earlier one. */
  seriesResults: Map<string, string>;
  /** The cut, if one was drawn: how big it was and who was seeded, in seed order. */
  topCut: { phaseId: string; topCutSize: number; seededParticipantIds: string[] } | null;
  winnerAccountId: string | null;
  finished: boolean;
};

/**
 * The tournament as the audit trail alone describes it.
 *
 * Deliberately reads NOTHING but the events — no table, no store, no id passed in from the test —
 * because the claim under test is that the ledger is sufficient to reconstruct the outcome. A
 * reconstruction that peeked at the database would pass even if half the events were missing.
 *
 * Later events supersede earlier ones for the same subject, which is what makes a corrected result
 * replay as the correction rather than as the mistake.
 */
function replayTournament(trail: readonly TournamentEvent[]): ReplayedTournament {
  const replayed: ReplayedTournament = {
    publishedRounds: new Set(),
    closedRounds: new Set(),
    seriesResults: new Map(),
    topCut: null,
    winnerAccountId: null,
    finished: false,
  };
  for (const event of trail) {
    const after = event.after as Record<string, unknown> | null;
    switch (event.command) {
      case "round_published":
        replayed.publishedRounds.add(Number(after?.roundNumber));
        break;
      case "round_closed":
        replayed.closedRounds.add(Number(after?.roundNumber));
        break;
      case "top_cut_started":
        replayed.topCut = {
          phaseId: event.phaseId!,
          topCutSize: Number(after?.topCutSize),
          seededParticipantIds: (after?.seededParticipantIds as string[] | undefined) ?? [],
        };
        break;
      case "tournament_finished":
        replayed.finished = true;
        replayed.winnerAccountId = (after?.winnerAccountId as string | null) ?? null;
        break;
      default:
        if (event.seriesId && typeof after?.officialResult === "string")
          replayed.seriesResults.set(event.seriesId, after.officialResult);
    }
  }
  return replayed;
}
