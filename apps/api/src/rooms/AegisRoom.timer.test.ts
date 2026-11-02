import { CardInstance } from "@aegis/shared/schema/CardInstance";
import { configureLocalScenario, clearLocalScenario } from "../engine/scenario/local.js";
import fixtureMatchTimer from "../engine/scenarios/match-timer.fixture.js";
import fixtureChronomonEngageOrder from "../engine/scenarios/chronomon-engage-order.fixture.js";
import fixtureArena from "../engine/scenarios/arena.fixture.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CombatWindow,
  EFFECT_UNIT_MS,
  EVENT_CHANNEL,
  MATCH_TIMER_DECISION_BONUS_MAX_SECONDS_PER_TURN,
  MATCH_TIMER_DECISION_BONUS_SECONDS,
  MATCH_TIMER_START_SECONDS,
  MULLIGAN_TIMER_SECONDS,
  PendingDecision,
  Phase,
  eventAnimationMs,
  type Seat,
  type ServerEvent,
} from "@aegis/shared";
import type { Client } from "colyseus";
import type { GameEngine } from "../engine/GameEngine.js";
import { AegisRoom } from "./AegisRoom.js";
import { RED_DECK } from "../engine/testDecks.js";

const rooms: AegisRoom[] = [];
afterEach(() => {
  for (const room of rooms.splice(0)) room.onDispose();
  clearLocalScenario();
  vi.restoreAllMocks();
});

function room(
  options: Parameters<AegisRoom["onCreate"]>[0] = {
    private: true,
    matchTimer: true,
    timerStartSeconds: 60,
    timerRefillSeconds: 0,
  },
) {
  const result = new AegisRoom();
  result.lock = vi.fn(async () => {});
  result.unlock = vi.fn(async () => {});
  result.setMatchmaking = vi.fn(async (updates) => {
    if (updates.maxClients !== undefined) result.maxClients = updates.maxClients;
  });
  result.lock = vi.fn(async () => undefined) as AegisRoom["lock"];
  result.broadcast = vi.fn() as AegisRoom["broadcast"];
  result.onCreate({ seed: 1, ...options });
  rooms.push(result);
  return result;
}
function engine(room: AegisRoom): GameEngine {
  return (room as unknown as { engine: GameEngine }).engine;
}
function sync(room: AegisRoom) {
  (room as unknown as { syncMatchClock(): void }).syncMatchClock();
}
function begin(room: AegisRoom, seat: Seat) {
  (room as unknown as { matchStartRequested: boolean }).matchStartRequested = true;
  room.state.turnCount = 1;
  room.state.phase = Phase.Main;
  room.state.turnSeat = seat;
  void engine(room).mainPhase.run(seat);
}

describe("room clock enforcement", () => {
  it("expires through the authoritative outcome pipeline and unwinds the Main wait", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const game = room();
    begin(game, 0);
    sync(game);
    now.mockReturnValue(60_000);
    sync(game);
    expect(game.state.gameOver).toBe(true);
    expect(game.state.winnerSeat).toBe(1);
    expect(engine(game).mainPhase.isOpen).toBe(false);
    expect(game.broadcast).toHaveBeenCalledWith(
      EVENT_CHANNEL,
      expect.objectContaining({ kind: "gameOver", reason: "timeout", result: { outcome: "win", winnerSeat: 1 } }),
    );
  });

  it("keeps the hand when the mulligan window runs out and refuses late answers", async () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const game = room();
    (game as unknown as { matchStartRequested: boolean }).matchStartRequested = true;
    const waiting = engine(game).mulligan.request(0);
    sync(game);
    now.mockReturnValue(60_000);
    sync(game);
    await expect(waiting).resolves.toBe(true);
    expect(game.state.gameOver).toBe(false);
    expect(game.state.timerRemaining0).toBe(60);
    expect(engine(game).mulligan.isOpen).toBe(false);
    expect(game.state.pendingDecision).toBeUndefined();
    expect(engine(game).applyIntent(0, { type: "mulligan", keep: false }).ok).toBe(false);
  });

  it("disables the timer when a legacy casual room successfully seats a bot", () => {
    const game = room({ matchTimer: true });
    const client = { sessionId: "human", send: vi.fn() } as never;
    game.clients.push(client);
    game.onJoin(client, { displayName: "Human", deck: { mainDeck: [], eggDeck: [] } });
    expect(game.addBot()).toBe(true);
    expect(game.state.matchTimer).toBe(false);
    expect(game.state.timerActiveSeat).toBe(-1);
  });

  it("charges a defending decision and not the turn player", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const game = room();
    begin(game, 0);
    const decision = new PendingDecision();
    decision.seat = 1;
    game.state.pendingDecision = decision;
    sync(game);
    now.mockReturnValue(10_000);
    sync(game);
    expect(game.state.timerRemaining0).toBe(60);
    expect(game.state.timerRemaining1).toBe(50);
    game.state.pendingDecision = undefined;
    const window = new CombatWindow();
    window.seat = 1;
    game.state.combatWindow = window;
    now.mockReturnValue(15_000);
    sync(game);
    expect(game.state.timerActiveSeat).toBe(1);
    expect(game.state.timerRemaining1).toBe(45);
  });

  it("pauses while the engine resolves and resumes the existing bank", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const game = room();
    begin(game, 0);
    sync(game);
    now.mockReturnValue(5000);
    sync(game);
    engine(game).mainVerbContinuationsInFlight = 1;
    sync(game);
    now.mockReturnValue(20_000);
    sync(game);
    expect(game.state.timerRemaining0).toBe(55);
    engine(game).mainVerbContinuationsInFlight = 0;
    sync(game);
    now.mockReturnValue(25_000);
    sync(game);
    expect(game.state.timerRemaining0).toBe(50);
  });

  it("publishes the 60s/30s turn bonuses once while retaining each player's reserve", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const game = room({ private: true, matchTimer: true, timerStartSeconds: 300, timerRefillSeconds: 0 });
    begin(game, 0);
    sync(game);
    now.mockReturnValue(100_000);
    sync(game);
    expect(game.state.timerRemaining0).toBe(200);
    const decision = new PendingDecision();
    decision.seat = 1;
    game.state.pendingDecision = decision;
    sync(game);
    now.mockReturnValue(150_000);
    sync(game);
    expect(game.state.timerRemaining1).toBe(250);

    game.state.turnCount = 2;
    game.state.turnSeat = 1;
    sync(game);
    expect(game.state.timerRemaining1).toBe(300);
    expect(game.state.timerRemaining0).toBe(230);
    now.mockReturnValue(170_000);
    sync(game);
    expect(game.state.timerRemaining1).toBe(280);

    game.state.pendingDecision = undefined;
    sync(game);
    now.mockReturnValue(220_000);
    sync(game);
    expect(game.state.timerRemaining0).toBe(180);
    game.state.turnCount = 3;
    game.state.turnSeat = 0;
    sync(game);
    expect(game.state.timerRemaining0).toBe(240);
    expect(game.state.timerRemaining1).toBe(300);
    now.mockReturnValue(230_000);
    sync(game);
    expect(game.state.timerRemaining0).toBe(230);
  });

  it("#39 adds combo time only for confirmed card plays and digivolutions", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const game = room();
    begin(game, 0);
    sync(game);
    now.mockReturnValue(50_000);
    sync(game);
    engine(game).hooks.emit({ kind: "cardPlayed", seat: 0, cardId: "BT1-010" });
    expect(game.state.timerRemaining0).toBe(10 + MATCH_TIMER_DECISION_BONUS_SECONDS);
    engine(game).hooks.emit({
      kind: "digivolved",
      seat: 0,
      cardId: "BT1-015",
      permanentId: "test",
      mechanic: "normal",
    });
    expect(game.state.timerRemaining0).toBe(10 + 2 * MATCH_TIMER_DECISION_BONUS_SECONDS);
    engine(game).hooks.emit({ kind: "memoryChanged", from: 1, to: 0, reason: "play" });
    expect(game.state.timerRemaining0).toBe(10 + 2 * MATCH_TIMER_DECISION_BONUS_SECONDS);
  });

  function presentingRoom() {
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const game = room();
    begin(game, 0);
    const internals = game as unknown as {
      seatByClient: Map<string, Seat>;
      stamp(event: ServerEvent): void;
      closeBatch(): void;
      handleAnimationSpeed(client: Client, payload: unknown): void;
    };
    internals.seatByClient.set("seat-0", 0);
    internals.seatByClient.set("seat-1", 1);
    const seats = [{ sessionId: "seat-0" } as Client, { sessionId: "seat-1" } as Client] as const;
    const effectBatch = () => {
      internals.stamp({ kind: "effectTriggered" } as ServerEvent);
      internals.closeBatch();
    };
    sync(game);
    return { now, game, internals, seats, effectBatch };
  }

  it("holds a Slow deciding seat until both back-to-back batches have played at Slow", () => {
    const { now, game, internals, seats, effectBatch } = presentingRoom();
    internals.handleAnimationSpeed(seats[0], { speed: "slow" });
    effectBatch();
    effectBatch();
    const slowEffectMs = Math.round(EFFECT_UNIT_MS * 1.4);
    now.mockReturnValue(2 * slowEffectMs - 100);
    sync(game);
    expect(game.state.timerActiveSeat).toBe(-1);
    expect(game.state.timerRemaining0).toBe(60);
    now.mockReturnValue(2 * slowEffectMs + 3000);
    sync(game);
    expect(game.state.timerActiveSeat).toBe(0);
    expect(game.state.timerRemaining0).toBe(57);
  });

  it("starts a Fast seat's clock earlier than a Slow seat's for the same batches", () => {
    const { now, game, internals, seats, effectBatch } = presentingRoom();
    internals.handleAnimationSpeed(seats[0], { speed: "fast" });
    internals.handleAnimationSpeed(seats[1], { speed: "slow" });
    effectBatch();
    effectBatch();
    const fastEnd = 2 * eventAnimationMs({ kind: "effectTriggered" }, 0, "fast");
    const slowEnd = 2 * eventAnimationMs({ kind: "effectTriggered" }, 1, "slow");
    expect(fastEnd).toBeLessThan(slowEnd);
    now.mockReturnValue(fastEnd + 1000);
    sync(game);
    expect(game.state.timerActiveSeat).toBe(0);
    expect(game.state.timerRemaining0).toBe(59);

    game.state.pendingDecision = new PendingDecision();
    game.state.pendingDecision.seat = 1;
    sync(game);
    now.mockReturnValue(slowEnd - 100);
    sync(game);
    expect(game.state.timerActiveSeat).toBe(-1);
    expect(game.state.timerRemaining1).toBe(60);
    now.mockReturnValue(slowEnd + 2000);
    sync(game);
    expect(game.state.timerRemaining1).toBe(58);
  });

  it("defaults to Normal and ignores speeds from spectators and malformed reports", () => {
    const { now, game, internals, effectBatch } = presentingRoom();
    const spectator = { sessionId: "spectator" } as Client;
    internals.handleAnimationSpeed(spectator, { speed: "slow" });
    internals.handleAnimationSpeed({ sessionId: "seat-0" } as Client, { speed: "turbo" });
    internals.handleAnimationSpeed({ sessionId: "seat-0" } as Client, null);
    effectBatch();
    now.mockReturnValue(EFFECT_UNIT_MS + 1000);
    sync(game);
    expect(game.state.timerActiveSeat).toBe(0);
    expect(game.state.timerRemaining0).toBe(59);
  });

  it("never runs before both seats are ready", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const game = room();
    sync(game);
    now.mockReturnValue(300_000);
    sync(game);
    expect(game.state.timerRemaining0).toBe(60);
    expect(game.state.gameOver).toBe(false);
  });

  it.each([fixtureMatchTimer, fixtureChronomonEngageOrder] as const)(
    "enables %s with the standard timer policy",
    (fixture) => {
      configureLocalScenario(fixture);
      const game = room({ botRoom: true, devScenario: "local-fixture" });
      expect(game.state.matchTimer).toBe(true);
      expect(game.state.timerStartSeconds).toBe(MATCH_TIMER_START_SECONDS);
      expect(game.state.timerRefillSeconds).toBe(60);
      configureLocalScenario(fixtureArena);
      expect(room({ botRoom: true, devScenario: "local-fixture", matchTimer: true }).state.matchTimer).toBe(false);
    },
  );

  it("disables crafted ranked, tournament and bot clock options", () => {
    for (const mode of [{ rankedRoom: true }, { tournamentRoom: true }, { botRoom: true }]) {
      expect(room({ ...mode, matchTimer: true }).state.matchTimer).toBe(false);
    }
  });

  it("ignores non-host overrides and legacy refill settings", () => {
    const game = room();
    expect(game.state.timerStartSeconds).toBe(60);
    expect(game.state.timerRefillSeconds).toBe(60);
    expect(room({ matchTimer: true, timerStartSeconds: 60, timerRefillSeconds: 0 }).state.timerStartSeconds).toBe(
      MATCH_TIMER_START_SECONDS,
    );
  });
});

/**
 * Discord suggestion "Timer improvement" (thread 1558298610754527232): a separate mulligan
 * window, no clock before the player's own decision, no clock while the opponent is away,
 * and combo time for effect decisions.
 */
describe("timer improvements from the Discord suggestion", () => {
  type Internals = {
    handleIntent(client: Client, intent: { type: string; keep?: boolean }): void;
    requestDecision(seat: Seat, request: { decisionId: string; seat: Seat; kind: string; promptText: string }): void;
  };

  function player(sessionId: string): Client {
    return { sessionId, send: vi.fn(), view: undefined } as unknown as Client;
  }

  async function settleRounds(predicate: () => boolean, rounds = 400): Promise<void> {
    for (let round = 0; round < rounds && !predicate(); round += 1)
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  async function startedMatch(options?: Parameters<AegisRoom["onCreate"]>[0]) {
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const game = room(options);
    const internals = game as unknown as Internals;
    const clients = [player("host"), player("guest")] as const;
    game.clients.push(clients[0]);
    game.onJoin(clients[0], { displayName: "Host", deck: RED_DECK });
    game.clients.push(clients[1]);
    game.onJoin(clients[1], { displayName: "Guest", deck: RED_DECK, roomCode: game.state.roomCode });
    internals.handleIntent(clients[0], { type: "ready" });
    internals.handleIntent(clients[1], { type: "ready" });
    await settleRounds(() => game.state.pendingDecision?.kind === "mulligan");
    let time = 0;
    const advance = (ms: number) => {
      time += ms;
      now.mockReturnValue(time);
      sync(game);
    };
    /** Moves to the end of the deciding seat's animations, where its clock starts. */
    const finishPresentation = () => {
      const seat = engine(game).inputSeat;
      const ends = (game as unknown as { matchClock: { presentEnd: [number, number] } }).matchClock.presentEnd;
      advance(Math.max(0, (seat === undefined ? time : ends[seat]) - time));
    };
    finishPresentation();
    return { game, internals, clients, advance, finishPresentation };
  }

  function mulliganRemaining(game: AegisRoom, seat: Seat): number {
    return seat === 0 ? game.state.mulliganTimerRemaining0 : game.state.mulliganTimerRemaining1;
  }
  function remaining(game: AegisRoom, seat: Seat): number {
    return seat === 0 ? game.state.timerRemaining0 : game.state.timerRemaining1;
  }

  it("A: runs a separate 30 s mulligan window and keeps the hand when it runs out", async () => {
    const { game, advance, finishPresentation } = await startedMatch();
    const first = game.state.pendingDecision!.seat as Seat;
    const hand = [...game.state.players[first]!.hand].map((card) => card.instanceId);
    advance(10_000);
    expect(game.state.timerActiveSeat).toBe(first);
    expect(mulliganRemaining(game, first)).toBe(MULLIGAN_TIMER_SECONDS - 10);
    expect(remaining(game, first)).toBe(60);
    advance(MULLIGAN_TIMER_SECONDS * 1000);
    expect(game.state.gameOver).toBe(false);
    expect(remaining(game, first)).toBe(60);
    expect([...game.state.players[first]!.hand].map((card) => card.instanceId)).toEqual(hand);
    await settleRounds(() => game.state.pendingDecision?.seat === 1 - first);
    const second = (1 - first) as Seat;
    expect(game.state.pendingDecision?.kind).toBe("mulligan");
    finishPresentation();
    advance(5000);
    expect(mulliganRemaining(game, second)).toBe(MULLIGAN_TIMER_SECONDS - 5);
    expect(remaining(game, second)).toBe(60);
  });

  it.each(["breeding", "main"] as const)(
    "enforces ninety seconds for the first public %s input after both mulligans",
    async (phase) => {
      const { game, internals, clients, advance, finishPresentation } = await startedMatch({ matchTimer: true });
      for (let index = 0; index < 2; index += 1) {
        await settleRounds(() => game.state.pendingDecision?.kind === "mulligan");
        const seat = game.state.pendingDecision!.seat;
        expect(game.state.inactivitySeat).toBe(-1);
        finishPresentation();
        advance(5000);
        internals.handleIntent(clients[seat], { type: "mulligan", keep: true });
        await settleRounds(
          () =>
            game.state.pendingDecision?.kind === "mulligan" ||
            engine(game).breeding.isOpen ||
            engine(game).mainPhase.isOpen,
        );
      }
      await settleRounds(() => game.state.pendingDecision === undefined && engine(game).inputSeat !== undefined);
      const seat = game.state.turnSeat as Seat;
      expect(engine(game).breeding.isOpen).toBe(true);
      if (phase === "main") {
        internals.handleIntent(clients[seat], { type: "endPhase" });
        await settleRounds(() => engine(game).mainPhase.isOpen && engine(game).inputSeat === seat);
      }
      expect(game.state.phase).toBe(phase === "main" ? Phase.Main : Phase.Breeding);
      sync(game);
      expect(game.state.inactivitySeat).toBe(seat);
      expect(game.state.inactivityRemainingSeconds).toBe(90);
      expect(remaining(game, seat)).toBe(300);
      expect(remaining(game, (1 - seat) as Seat)).toBe(300);
      finishPresentation();
      advance(89_999);
      expect(game.state.gameOver).toBe(false);
      advance(1);
      expect(game.state.gameOver).toBe(true);
      expect(game.state.winnerSeat).toBe(1 - seat);
      expect(game.state.inactivityRemainingSeconds).toBe(0);
      expect(remaining(game, seat)).toBe(210);
      expect(game.broadcast).toHaveBeenCalledWith(
        EVENT_CHANNEL,
        expect.objectContaining({ kind: "gameOver", reason: "timeout" }),
      );
    },
  );

  async function inMainPhase(options?: Parameters<AegisRoom["onCreate"]>[0]) {
    const match = await startedMatch(options);
    const { game, internals, clients } = match;
    for (let index = 0; index < 2; index += 1) {
      const seat = game.state.pendingDecision!.seat as Seat;
      internals.handleIntent(clients[seat], { type: "mulligan", keep: true });
      await settleRounds(() => game.state.pendingDecision?.kind === "mulligan" || engine(game).inputSeat !== undefined);
    }
    const turnSeat = game.state.turnSeat as Seat;
    await settleRounds(() => engine(game).mainPhase.isOpen || engine(game).breeding.isOpen);
    if (!engine(game).mainPhase.isOpen) {
      internals.handleIntent(clients[turnSeat], { type: "endPhase" });
      await settleRounds(() => engine(game).mainPhase.isOpen);
    }
    match.finishPresentation();
    return { ...match, turnSeat };
  }

  it("B: never charges the next player before they hold a decision of their own", async () => {
    const { game, internals, clients, advance, finishPresentation, turnSeat } = await inMainPhase();
    const next = (1 - turnSeat) as Seat;
    const before = remaining(game, next);
    internals.handleIntent(clients[turnSeat], { type: "endPhase" });
    let ownDecisionAt: number | undefined;
    for (let round = 0; round < 400 && ownDecisionAt === undefined; round += 1) {
      const deciding = engine(game).inputSeat;
      if (deciding === next) ownDecisionAt = round;
      else {
        const left = remaining(game, next);
        advance(1000);
        expect(game.state.timerActiveSeat).not.toBe(next);
        expect(remaining(game, next)).toBeGreaterThanOrEqual(left);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
    expect(ownDecisionAt).toBeDefined();
    expect(game.state.turnSeat).toBe(next);
    expect(remaining(game, next)).toBeGreaterThanOrEqual(before);
    finishPresentation();
    advance(1000);
    expect(game.state.timerActiveSeat).toBe(next);
    expect(remaining(game, next)).toBe(before - 1);
  });

  it("C: freezes the waiting player's clock while the opponent is disconnected", async () => {
    const { game, clients, advance, finishPresentation, turnSeat } = await inMainPhase();
    const away = (1 - turnSeat) as Seat;
    let reconnect!: (client: Client) => void;
    game.allowReconnection = vi.fn(
      () => new Promise<Client>((resolve) => (reconnect = resolve)),
    ) as unknown as AegisRoom["allowReconnection"];
    advance(5000);
    const waiting = remaining(game, turnSeat);
    const leaving = game.onLeave(clients[away], 1006);
    await settleRounds(() => reconnect !== undefined);
    advance(40_000);
    expect(game.state.timerActiveSeat).toBe(-1);
    expect(remaining(game, turnSeat)).toBe(waiting);
    const back = player("guest-back");
    game.clients.push(back);
    reconnect(back);
    await leaving;
    finishPresentation();
    advance(4000);
    expect(game.state.timerActiveSeat).toBe(turnSeat);
    expect(remaining(game, turnSeat)).toBe(waiting - 4);
  });

  it("C: keeps charging a disconnected player who holds the decision", async () => {
    const { game, clients, advance, finishPresentation, turnSeat } = await inMainPhase();
    game.allowReconnection = vi.fn(() => new Promise<Client>(() => {})) as unknown as AegisRoom["allowReconnection"];
    void game.onLeave(clients[turnSeat], 1006);
    await settleRounds(() => game.state.players[turnSeat]?.connected === false);
    finishPresentation();
    const before = remaining(game, turnSeat);
    advance(10_000);
    expect(remaining(game, turnSeat)).toBe(before - 10);
  });

  it("keeps the public decision budget visible and paused while the opponent reconnects", async () => {
    const { game, clients, advance, finishPresentation, turnSeat } = await inMainPhase({ matchTimer: true });
    const away = (1 - turnSeat) as Seat;
    let reconnect!: (client: Client) => void;
    game.allowReconnection = vi.fn<() => Promise<Client>>(
      () =>
        new Promise<Client>((resolve) => {
          reconnect = resolve;
        }),
    ) as unknown as AegisRoom["allowReconnection"];
    advance(20_000);
    expect(game.state.inactivityRemainingSeconds).toBe(70);
    const leaving = game.onLeave(clients[away], 1006);
    await settleRounds(() => reconnect !== undefined);
    advance(40_000);
    expect(game.state.inactivitySeat).toBe(turnSeat);
    expect(game.state.timerActiveSeat).toBe(-1);
    expect(game.state.inactivityRemainingSeconds).toBe(70);
    expect(remaining(game, turnSeat)).toBe(280);
    const back = player("reconnected-opponent");
    game.clients.push(back);
    reconnect(back);
    await leaving;
    finishPresentation();
    expect(game.state.inactivitySeat).toBe(turnSeat);
    expect(game.state.inactivityRemainingSeconds).toBe(70);
    advance(69_999);
    expect(game.state.gameOver).toBe(false);
    advance(1);
    expect(game.state.gameOver).toBe(true);
    expect(game.state.winnerSeat).toBe(away);
    expect(game.state.inactivityRemainingSeconds).toBe(0);
  });

  it("D: adds 3 s per effect decision, up to 30 s per player per turn, and none for the mulligan", async () => {
    const { game, internals, advance, turnSeat } = await inMainPhase();
    const request = (kind: string, id: string) =>
      internals.requestDecision(turnSeat, { decisionId: id, seat: turnSeat, kind, promptText: "" });
    advance(50_000);
    expect(remaining(game, turnSeat)).toBe(10);
    request("mulligan", "m");
    expect(remaining(game, turnSeat)).toBe(10);
    request("orderTriggers", "a");
    expect(remaining(game, turnSeat)).toBe(10 + MATCH_TIMER_DECISION_BONUS_SECONDS);
    for (let index = 0; index < 20; index += 1) request("chooseTargets", `t${index}`);
    expect(remaining(game, turnSeat)).toBe(10 + MATCH_TIMER_DECISION_BONUS_MAX_SECONDS_PER_TURN);
    game.state.turnCount += 1;
    request("optional", "next-turn");
    expect(remaining(game, turnSeat)).toBe(10 + MATCH_TIMER_DECISION_BONUS_MAX_SECONDS_PER_TURN + 3);
  });
});

describe("public inactivity enforcement", () => {
  it("ignores invalid and repeated ready intents and ends the actual unanswered Main wait", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const game = room({ matchTimer: true });
    begin(game, 0);
    sync(game);
    const apply = (
      game as unknown as { applyLoggedIntent(seat: Seat, intent: { type: string }): { ok: boolean } }
    ).applyLoggedIntent.bind(game);
    now.mockReturnValue(60_000);
    expect(apply(1, { type: "endPhase" }).ok).toBe(false);
    expect(apply(0, { type: "ready" }).ok).toBe(true);
    expect(game.state.inactivityRemainingSeconds).toBe(30);
    now.mockReturnValue(90_000);
    sync(game);
    expect(game.state.gameOver).toBe(true);
    expect(game.state.winnerSeat).toBe(1);
    expect(engine(game).mainPhase.isOpen).toBe(false);
    expect(game.state.timerRemaining0).toBeGreaterThan(0);
  });
});

it("refreshes inactivity after a legal Main play without resetting the match clock", async () => {
  const now = vi.spyOn(performance, "now").mockReturnValue(0);
  const game = room({ matchTimer: true });
  engine(game).seatPlayer(0, "active-player", { displayName: "Active", deck: RED_DECK });
  engine(game).seatPlayer(1, "waiting-player", { displayName: "Waiting", deck: RED_DECK });
  begin(game, 0);
  game.state.memory = 10;
  const card = new CardInstance();
  card.instanceId = "main-play";
  card.cardId = "BT1-010";
  card.ownerSeat = 0;
  game.state.players[0]!.hand.push(card);
  sync(game);
  now.mockReturnValue(70_000);
  sync(game);
  const apply = (
    game as unknown as { applyLoggedIntent(seat: Seat, intent: { type: string; instanceId: string }): { ok: boolean } }
  ).applyLoggedIntent.bind(game);
  expect(apply(0, { type: "playCard", instanceId: card.instanceId }).ok).toBe(true);
  for (let round = 0; round < 100 && engine(game).inputSeat === undefined; round++) {
    await Promise.resolve();
  }
  sync(game);
  expect(game.state.inactivityRemainingSeconds).toBe(90);
  expect(game.state.timerRemaining0).toBeLessThan(300);
  expect(game.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === card.instanceId)).toBe(
    true,
  );
});

it.each(
  ([0, 1] as const).flatMap((seat) =>
    (["optional", "chooseTargets", "selectCards", "chooseOption", "orderCards", "orderTriggers"] as const).map(
      (kind) => ({ seat, kind }),
    ),
  ),
)("expires a real $kind decision for seat$seat after its own ninety seconds", async ({ seat, kind }) => {
  const now = vi.spyOn(performance, "now").mockReturnValue(0);
  const game = room({ matchTimer: true });
  begin(game, 0);
  const waiting = engine(game).decisions.request({
    seat,
    kind,
    promptText: "Select a target",
    options: { candidateInstanceIds: ["target"], min: 1, max: 1 },
  });
  sync(game);
  expect(game.state.inactivitySeat).toBe(seat);
  expect(game.state.inactivityRemainingSeconds).toBe(90);
  now.mockReturnValue(89_999);
  sync(game);
  expect(game.state.gameOver).toBe(false);
  now.mockReturnValue(90_000);
  sync(game);
  await waiting;
  expect(game.state.gameOver).toBe(true);
  expect(game.state.winnerSeat).toBe(1 - seat);
  expect(game.state.pendingDecision).toBeUndefined();
  expect(game.state.inactivityRemainingSeconds).toBe(0);
});

it.each(["block", "counter", "alliance", "evade", "barrier"] as const)(
  "applies the ninety-second budget to the %s combat window",
  (kind) => {
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const game = room({ matchTimer: true });
    begin(game, 0);
    const window = new CombatWindow();
    window.kind = kind;
    const seat = kind === "alliance" ? 0 : 1;
    window.seat = seat;
    window.attackerPermanentId = "attacker";
    window.permanentId = "defender";
    game.state.combatWindow = window;
    sync(game);
    expect(game.state.inactivitySeat).toBe(seat);
    expect(game.state.inactivityRemainingSeconds).toBe(90);
    now.mockReturnValue(89_999);
    sync(game);
    expect(game.state.gameOver).toBe(false);
    now.mockReturnValue(90_000);
    sync(game);
    expect(game.state.gameOver).toBe(true);
    expect(game.state.winnerSeat).toBe(1 - seat);
    expect(seat === 0 ? game.state.timerRemaining0 : game.state.timerRemaining1).toBe(210);
    expect(game.state.inactivityRemainingSeconds).toBe(0);
  },
);
