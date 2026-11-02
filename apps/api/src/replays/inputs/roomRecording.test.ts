import { RankedRoundClock } from "#api/ranked/RankedRoundClock";
import type { AccountStore } from "#api/accounts/AccountStore";
import { CloseCode, type Client } from "colyseus";
import { ArraySchema } from "@colyseus/schema";
import { CombatWindow, type Intent, type Seat } from "@aegis/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AegisRoom } from "../../rooms/AegisRoom.js";
import { CasualSeries } from "../../rooms/series/CasualSeries.js";
import type { SeriesStore } from "../../tournaments/series/index.js";
import { addLogSink } from "../../logger.js";
import { BLUE_DECK, RED_DECK } from "../../engine/testDecks.js";
import type { GameEngine } from "../../engine/GameEngine.js";
import { extractReplay } from "./extract.js";
import { runReplay } from "./run.js";
import { comparableState } from "./roomMatch.fixture.js";

/**
 * Every room path that changes engine state outside an intent writes the line `extractReplay`
 * needs to feed it back, and the stray `ready` a tournament bot sends is now an ordinary recorded
 * intent. Each test drives the real path and reads back what the room logged.
 */

type Internals = {
  rankedRoundClock?: RankedRoundClock;
  engine: GameEngine;
  handleIntent(client: Client, intent: Intent): void;
  syncMatchClock(): void;
  syncCombatWindowTimeout(): void;
  matchClock: { update(now: number, seat: Seat | undefined): { seat: Seat; clock: "match" | "mulligan" } | undefined };
};

let lines: string[] = [];
let stopCapture: () => void = () => {};
const rooms: AegisRoom[] = [];

beforeEach(() => {
  lines = [];
  stopCapture = addLogSink((line) => lines.push(line));
});

afterEach(() => {
  stopCapture();
  for (const room of rooms.splice(0)) {
    room.onDispose();
    room.clock.stop();
  }
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function makeRoom(options: Parameters<AegisRoom["onCreate"]>[0] = {}, RoomClass = AegisRoom): AegisRoom {
  const room = new RoomClass();
  room.lock = vi.fn<() => Promise<void>>(async () => {});
  room.unlock = vi.fn<() => Promise<void>>(async () => {});
  room.setMatchmaking = vi.fn<() => Promise<void>>(async () => {});
  room.broadcast = vi.fn<() => boolean>(() => true) as AegisRoom["broadcast"];
  void room.onCreate({ seed: 5, ...options });
  rooms.push(room);
  return room;
}

function internals(room: AegisRoom): Internals {
  return room as unknown as Internals;
}

function join(room: AegisRoom, sessionId: string, deck = RED_DECK): Client {
  const client = { sessionId, send: vi.fn<() => void>(), view: undefined } as unknown as Client;
  room.clients.push(client);
  room.onJoin(client, { displayName: `Name ${sessionId}`, deck });
  return client;
}

/** `[name, payload]` of every line this room logged, in order. */
function logged(room: AegisRoom): [string, Record<string, unknown>][] {
  return lines
    .map((line) => JSON.parse(line) as { matchId?: string; data: [string, Record<string, unknown>] })
    .filter((line) => line.matchId === room.state.matchLogId)
    .map((line) => line.data);
}

function replayLines(room: AegisRoom, name: string): Record<string, unknown>[] {
  return logged(room)
    .filter(([lineName]) => lineName === name)
    .map(([, payload]) => payload);
}

async function macrotask(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

/** Two people seated and ready, both mulligans kept: the match is under way. */
async function startedMatch(room: AegisRoom): Promise<[Client, Client]> {
  const clients: [Client, Client] = [join(room, "a", RED_DECK), join(room, "b", BLUE_DECK)];
  for (const client of clients) internals(room).handleIntent(client, { type: "ready" });
  for (let keep = 0; keep < 2; keep++) {
    await macrotask();
    const seat = room.state.pendingDecision!.seat as Seat;
    internals(room).handleIntent(clients[seat], { type: "mulligan", keep: true });
  }
  await macrotask();
  return clients;
}

describe("AegisRoom replay recording", () => {
  it("writes a header with the seed, the room rules and the server revision", () => {
    vi.stubEnv("AEGIS_REVISION", "abc1234");
    const room = makeRoom({ seed: 99 });

    expect(replayLines(room, "replay.header")).toEqual([
      {
        gameMode: "automatic",
        replaySeq: 1,
        seed: 99,
        randomKey: expect.stringMatching(/^[a-f0-9]{64}$/),
        serverRevision: "abc1234",
        deckFormat: "standard",
        unlimited: false,
        betaBattle: false,
      },
    ]);
    vi.unstubAllEnvs();
  });

  it("records the first seat a casual series imposes on its next game", () => {
    vi.spyOn(CasualSeries, "begin").mockReturnValue({
      fixedFirstSeat: 1,
      dispose: () => {},
    } as unknown as CasualSeries);
    const room = makeRoom({ bestOf: 3 });

    expect(replayLines(room, "replay.header")[0]).toMatchObject({ seed: 5, firstSeat: 1 });
    expect(internals(room).engine.hooks.firstSeat).toBe(1);
  });

  it("records each seat's deck, the ready gate's match start and an intent's ordinal", async () => {
    const room = makeRoom();
    await startedMatch(room);

    const seats = replayLines(room, "replay.seat");
    expect(seats).toEqual([
      expect.objectContaining({
        seat: 0,
        deck: { mainDeck: RED_DECK.mainDeck, eggDeck: RED_DECK.eggDeck },
        deckRules: { betaBattleMode: false, unlimited: false, format: "standard" },
        stateVersion: 0,
        engineEvents: 0,
      }),
      expect.objectContaining({ seat: 1, deck: { mainDeck: BLUE_DECK.mainDeck, eggDeck: BLUE_DECK.eggDeck } }),
    ]);
    expect(JSON.stringify(seats)).not.toContain("Name a");

    expect(replayLines(room, "replay.input")).toEqual([
      expect.objectContaining({ kind: "startMatch", site: "bothReady", engineEvents: 0 }),
    ]);
    const received = replayLines(room, "intent.received");
    const results = replayLines(room, "intent.result");
    expect(received.map((line) => (line.intent as Intent).type)).toEqual(["ready", "ready", "mulligan", "mulligan"]);
    expect(results.map((line) => line.replaySeq)).toEqual(received.map((line) => line.replaySeq));
    expect(received.every((line) => typeof line.engineEvents === "number")).toBe(true);
  });

  it("replays a ranked round timeout as the same authoritative draw", async () => {
    const room = makeRoom();
    await startedMatch(room);
    internals(room).rankedRoundClock = new RankedRoundClock(Date.now() - 54 * 60_000);
    internals(room).syncMatchClock();
    expect(room.state.gameOver).toBe(true);
    expect(replayLines(room, "replay.input")).toContainEqual(expect.objectContaining({ kind: "expireRankedRound" }));
    const replay = await runReplay(extractReplay(lines, room.state.matchLogId));
    expect(replay.divergences).toEqual([]);
    expect(replay.state.gameOver).toBe(true);
    expect(replay.state.winnerSeat).toBe(-1);
  });

  it("ends after the third extra turn before the next turn can draw a card", async () => {
    const room = makeRoom();
    const clients = await startedMatch(room);
    const turnZero = room.state.turnCount;
    const clock = new RankedRoundClock(Date.now() - 48 * 60_000);
    clock.shouldDraw({ now: Date.now(), turn: turnZero, safe: false });
    internals(room).rankedRoundClock = clock;
    for (let phase = 0; phase < 16 && !room.state.gameOver; phase++) {
      internals(room).handleIntent(clients[room.state.turnSeat as Seat], { type: "endPhase" });
      await macrotask();
    }
    expect(room.state.gameOver).toBe(true);
    expect(room.state.turnCount).toBe(turnZero + 3);
    expect(replayLines(room, "replay.input")).toContainEqual(
      expect.objectContaining({ kind: "expireRankedRound", site: "beforeTurn" }),
    );
    const replay = await runReplay(extractReplay(lines, room.state.matchLogId));
    expect(replay.divergences).toEqual([]);
    expect(replay.state.turnCount).toBe(turnZero + 3);
  });

  it("records a dropped connection and its reconnection, then a match-clock loss", async () => {
    const room = makeRoom();
    const [, b] = await startedMatch(room);
    room.allowReconnection = vi.fn<() => Promise<Client>>(async () => b) as unknown as AegisRoom["allowReconnection"];

    await room.onLeave(b, CloseCode.ABNORMAL_CLOSURE);
    internals(room).matchClock.update = () => ({ seat: 1, clock: "match" });
    internals(room).syncMatchClock();

    expect(room.state.gameOver).toBe(true);
    expect(replayLines(room, "replay.input").slice(1)).toEqual([
      expect.objectContaining({ kind: "disconnect", seat: 1, final: false }),
      expect.objectContaining({ kind: "reconnect", seat: 1 }),
      expect.objectContaining({ kind: "expireMatchTimer", seat: 1 }),
    ]);

    // And the lines are enough to rebuild it: same result, no divergence.
    const replay = await runReplay(extractReplay(lines, room.state.matchLogId));
    expect(replay.divergences).toEqual([]);
    expect(replay.state.gameOver).toBe(true);
    expect(replay.state.winnerSeat).toBe(room.state.winnerSeat);
    expect(replay.state.stateVersion).toBe(room.state.stateVersion);
  });

  it("records a mulligan window running out, and the replay keeps the same hand", async () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const room = makeRoom({ private: true, matchTimer: true, timerStartSeconds: 60, timerRefillSeconds: 0 });
    const clients: [Client, Client] = [join(room, "a", RED_DECK), join(room, "b", BLUE_DECK)];
    for (const client of clients) internals(room).handleIntent(client, { type: "ready" });
    // Neither seat answers its mulligan: each window runs out in turn and the room keeps the hand.
    let time = 0;
    for (let round = 0; round < 50 && room.state.pendingDecision?.kind !== "mulligan"; round++) await macrotask();
    const expiries = () => replayLines(room, "replay.input").filter((line) => line.kind === "expireMulliganWindow");
    for (let window = 0; window < 2; window++) {
      const seat = room.state.pendingDecision!.seat as Seat;
      // The first sync starts the seat's mulligan clock; the second, long after, runs it out.
      internals(room).syncMatchClock();
      time += 10 * 60_000;
      now.mockReturnValue(time);
      internals(room).syncMatchClock();
      expect(expiries().at(-1)).toMatchObject({ seat });
      for (let round = 0; round < 50 && room.state.pendingDecision?.seat === seat; round++) await macrotask();
      if (window === 1) break;
      for (let round = 0; round < 50 && room.state.pendingDecision?.kind !== "mulligan"; round++) await macrotask();
    }
    await macrotask();

    expect(expiries().map((line) => line.seat)).toHaveLength(2);
    expect(new Set(expiries().map((line) => line.seat))).toEqual(new Set([0, 1]));
    expect(replayLines(room, "intent.received").map((line) => (line.intent as Intent).type)).toEqual([
      "ready",
      "ready",
    ]);

    const record = extractReplay(lines, room.state.matchLogId);
    expect(record.inputs.filter((input) => input.kind === "expireMulliganWindow")).toHaveLength(2);
    const replay = await runReplay(JSON.parse(JSON.stringify(record)));
    expect(replay.divergences).toEqual([]);
    expect(replay.state.stateVersion).toBe(room.state.stateVersion);
    for (const seat of [0, 1] as const)
      expect([...replay.state.players[seat]!.hand].map((card) => card.cardId)).toEqual(
        [...room.state.players[seat]!.hand].map((card) => card.cardId),
      );
    internals(room).engine.syncCounts();
    replay.engine.syncCounts();
    expect(comparableState(replay.state)).toEqual(comparableState(room.state));
  });

  it("records a departure as clearReady then a final disconnect, and the replacement's seat", async () => {
    const room = makeRoom();
    const a = join(room, "a", RED_DECK);
    join(room, "b", BLUE_DECK);
    internals(room).handleIntent(a, { type: "ready" });
    await room.onLeave(a, CloseCode.CONSENTED);
    join(room, "c", BLUE_DECK);

    expect(replayLines(room, "replay.input")).toEqual([
      expect.objectContaining({ kind: "clearReady", seat: 0 }),
      expect.objectContaining({ kind: "disconnect", seat: 0, final: true }),
    ]);
    expect(replayLines(room, "replay.seat").map((line) => line.seat)).toEqual([0, 1, 0]);
    expect(extractReplay(lines, room.state.matchLogId).seats[0].deck.mainDeck).toEqual(BLUE_DECK.mainDeck);
  });

  it("records a combat window the room closes on its answer timeout, and a ready-timeout start", () => {
    vi.useFakeTimers();
    const room = makeRoom();
    join(room, "a");
    join(room, "b", BLUE_DECK);
    const window = new CombatWindow();
    window.kind = "block";
    window.seat = 0;
    window.attackerPermanentId = "attacker";
    window.eligiblePermanentIds = new ArraySchema<string>("blocker");
    room.state.combatWindow = window;
    internals(room).syncCombatWindowTimeout();

    vi.advanceTimersByTime(240_000);
    room.clock.tick();

    const inputs = replayLines(room, "replay.input");
    expect(inputs).toContainEqual(expect.objectContaining({ kind: "expireCombatWindow" }));
    expect(inputs.filter((input) => input.kind === "expireCombatWindow")).toHaveLength(1);
    // Nobody sent `ready`, so the 60-second ready timeout started the match on the same tick.
    expect(inputs).toContainEqual(expect.objectContaining({ kind: "startMatch" }));
    expect(inputs.filter((input) => input.kind === "startMatch")).toHaveLength(1);
  });

  it("records a bot's seat, and sends a tournament bot's ready as a recorded intent", async () => {
    const series = {
      inspectAuthorization: async () => ({
        ok: true,
        value: { kind: "bot", participantId: "participant-1", authorization: { tournamentId: "tournament-one" } },
      }),
      claimGame: async () => ({
        ok: true,
        value: {
          participantId: "participant-1",
          kind: "bot",
          displayName: "Tournament Bot",
          deck: { deckId: "frozen", name: "Frozen", ...RED_DECK },
        },
      }),
      markGamePlaying: async () => true,
    } as unknown as SeriesStore;
    class TournamentRoom extends AegisRoom {
      protected override accounts(): AccountStore {
        return { tournament: async () => ({ format: "standard", banlistCards: [] }) } as unknown as AccountStore;
      }
      protected override series(): SeriesStore {
        return series;
      }
    }
    const room = makeRoom({ tournamentRoom: true }, TournamentRoom);

    expect(await room.seatTournamentBot({ gameId: "game-1", authorizationToken: "token" })).toBe(true);

    expect(replayLines(room, "replay.seat")).toEqual([
      expect.objectContaining({ seat: 0, bot: true, deck: { mainDeck: RED_DECK.mainDeck, eggDeck: RED_DECK.eggDeck } }),
    ]);
    expect(replayLines(room, "intent.received")).toEqual([
      expect.objectContaining({ seat: 0, intent: { type: "ready" } }),
    ]);
    expect(replayLines(room, "intent.result")).toEqual([
      expect.objectContaining({ seat: 0, type: "ready", result: { ok: true } }),
    ]);
  });

  it("records a bot room's bot seat and the match start addBot makes", () => {
    const room = makeRoom({ botRoom: true });
    join(room, "a");

    expect(room.addBot()).toBe(true);

    expect(replayLines(room, "replay.seat")[1]).toMatchObject({ seat: 1, bot: true });
    expect(replayLines(room, "replay.input")).toEqual([expect.objectContaining({ kind: "startMatch" })]);
    expect(replayLines(room, "replay.input")[0]).not.toHaveProperty("site");
  });
});
