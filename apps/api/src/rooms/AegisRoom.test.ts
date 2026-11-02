import { afterEach, describe, it, expect, vi } from "vitest";
import { CloseCode, Room, type Client } from "colyseus";
import { ArraySchema, Encoder } from "@colyseus/schema";
import {
  ALL_FAMOUS_DECKS,
  CombatWindow,
  PendingDecision,
  Phase,
  type DecisionRequest,
  DECISION_CHANNEL,
  EVENT_CHANNEL,
  isFamousDeckAvailable,
  type SequencedServerEvent,
  type ServerEvent,
} from "@aegis/shared";
import { AegisRoom, roomCodeDirectory, setRoomCodeDirectory } from "./AegisRoom.js";
import { setRoomCreationAdmission } from "../deployment/admission.js";
import type { RoomCodeDirectory } from "../cluster/roomCodes.js";
import type { DecisionManager } from "../engine/decisions/index.js";
import { BLUE_DECK, RED_DECK } from "../engine/testDecks.js";
import { DEFAULT_MAX_ACTION_DELAY_MS } from "../bot/BotPlayer.js";

/**
 * Room-level coverage for the ready-gated match start (subsystem:
 * intent-protocol-and-room). AegisRoom is instantiated directly and driven through
 * its lifecycle hooks, bypassing the Colyseus matchmaker/transport — the same
 * pattern the framework itself uses internally (it pushes the client into
 * `room.clients` before invoking `onJoin`). `broadcast` is stubbed so assertions can
 * inspect emitted events without decoding the wire protocol.
 */

const EMPTY_DECK = { mainDeck: [], eggDeck: [] };

function fakeClient(sessionId: string): Client {
  return { sessionId, send: vi.fn(), view: undefined } as unknown as Client;
}

type BroadcastCall = [string, unknown, { afterNextPatch?: boolean } | undefined];

function makeRoom(
  options: {
    unlimitedRoom?: boolean;
    botRoom?: boolean;
    betaBattleRoom?: boolean;
    private?: boolean;
    seed?: number;
  } = {},
): AegisRoom {
  const room = new AegisRoom();
  room.lock = vi.fn(async () => {});
  room.unlock = vi.fn(async () => {});
  room.setMatchmaking = vi.fn(async (updates) => {
    if (updates.maxClients !== undefined) room.maxClients = updates.maxClients;
  });
  const broadcastCalls: BroadcastCall[] = [];
  room.broadcast = vi.fn((type: string, message: unknown, broadcastOptions?: { afterNextPatch?: boolean }) => {
    broadcastCalls.push([type, message, broadcastOptions]);
    return true;
  }) as AegisRoom["broadcast"];
  (room as unknown as { broadcastCalls: BroadcastCall[] }).broadcastCalls = broadcastCalls;
  room.onCreate({ seed: options.seed ?? 1, ...options });
  return room;
}

function recordedBroadcasts(room: AegisRoom): BroadcastCall[] {
  return (room as unknown as { broadcastCalls: BroadcastCall[] }).broadcastCalls;
}

function broadcastedEvents(room: AegisRoom): ServerEvent[] {
  return recordedBroadcasts(room)
    .filter(([type]) => type === EVENT_CHANNEL)
    .map(([, event]) => event as ServerEvent);
}

/** Everything the room put on the event channel, envelope included. */
function sequencedEvents(room: AegisRoom): SequencedServerEvent[] {
  return broadcastedEvents(room) as SequencedServerEvent[];
}

function intentSender(room: AegisRoom): (client: Client, intent: { type: string }) => void {
  return (room as unknown as { handleIntent: (c: Client, i: { type: string }) => void }).handleIntent.bind(room);
}

function joinBothSeats(room: AegisRoom): [Client, Client] {
  const a = fakeClient("session-a");
  const b = fakeClient("session-b");
  room.clients.push(a);
  room.onJoin(a, { displayName: "A", deck: EMPTY_DECK });
  room.clients.push(b);
  room.onJoin(b, { displayName: "B", deck: EMPTY_DECK });
  return [a, b];
}

describe("AegisRoom patch lifecycle", () => {
  const originalDirectory = roomCodeDirectory();

  afterEach(() => {
    setRoomCodeDirectory(originalDirectory);
    setRoomCreationAdmission(() => true);
  });

  it("allows a patch before room creation", () => {
    const room = new AegisRoom();
    expect(() => room.broadcastPatch()).not.toThrow();
    expect(room.broadcastPatch()).toBe(false);
  });

  it("allows patches while a private room code lookup is pending, then syncs counts", async () => {
    let finishLookup!: (owner: string | undefined) => void;
    setRoomCodeDirectory({
      claim: vi.fn<RoomCodeDirectory["claim"]>(),
      release: vi.fn<RoomCodeDirectory["release"]>(),
      resolve: () =>
        new Promise((resolve) => {
          finishLookup = resolve;
        }),
    });
    const room = new AegisRoom();
    const creation = room.onCreate({ seed: 1, private: true, roomCode: "ABCDEF" });
    try {
      try {
        expect(() => room.broadcastPatch()).not.toThrow();
      } finally {
        finishLookup(undefined);
        await creation;
      }
      joinBothSeats(room);
      const player = room.state.players[0]!;
      player.deckCount = -1;
      room.broadcastPatch();
      expect(player.deckCount).toBe(player.deck.length);
    } finally {
      room.onDispose();
    }
  });

  it("cleans up the Colyseus patch timer when a private room code is refused before state exists", async () => {
    vi.useFakeTimers();
    const room = new AegisRoom();
    const patch = vi.spyOn(room, "broadcastPatch");
    const events = Reflect.get(room, "_events") as {
      once(event: string, listener: () => void): void;
      emit(event: string): void;
    };
    setRoomCodeDirectory({
      claim: vi.fn<RoomCodeDirectory["claim"]>(),
      release: vi.fn<RoomCodeDirectory["release"]>(),
      resolve: async () => "live-room",
    });
    const initialize = Reflect.get(room, "__init") as () => void;
    initialize.call(room);
    try {
      await expect(room.onCreate({ private: true, roomCode: "ABCDEF" })).rejects.toThrow("still in use");
      // MatchMaker emits dispose when onCreate rejects; Room clears its timers after onDispose.
      const disposed = new Promise<void>((resolve) => events.once("disconnect", resolve));
      events.emit("dispose");
      await disposed;
      await vi.advanceTimersByTimeAsync(1000);
      expect(patch).not.toHaveBeenCalled();
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("allows patches after room creation is refused by the deployment gate", () => {
    setRoomCreationAdmission(() => false);
    const room = new AegisRoom();
    expect(() => room.onCreate({})).toThrow("draining");
    try {
      expect(() => room.broadcastPatch()).not.toThrow();
    } finally {
      room.onDispose();
    }
  });
});

describe("AegisRoom ready-gated match start", () => {
  afterEach(() => vi.useRealTimers());

  it("disposes a waiting room that never starts", async () => {
    vi.useFakeTimers();
    const room = makeRoom();
    room.disconnect = vi.fn(async () => undefined) as AegisRoom["disconnect"];

    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    room.clock.tick();

    expect(room.disconnect).toHaveBeenCalledOnce();
  });

  it("does not expire a match after both players start it", async () => {
    vi.useFakeTimers();
    const room = makeRoom();
    room.disconnect = vi.fn(async () => undefined) as AegisRoom["disconnect"];
    const [first, second] = joinBothSeats(room);
    intentSender(room)(first, { type: "ready" });
    intentSender(room)(second, { type: "ready" });

    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    room.clock.tick();

    expect(room.disconnect).not.toHaveBeenCalled();
  });

  it("GitHub #5202: requires both seats to opt into Unlimited and cannot bypass a standard room's banlist", async () => {
    const room = makeRoom({ unlimitedRoom: true });
    const first = fakeClient("unlimited-first");
    const deck = { mainDeck: [...RED_DECK.mainDeck], eggDeck: [...RED_DECK.eggDeck] };
    deck.mainDeck.splice(0, 4, ...Array<string>(4).fill("BT5-109"));
    const options = { displayName: "Unlimited", deck, unlimited: true };
    expect(await room.onAuth(first, options)).toBe(true);
    room.clients.push(first);
    room.onJoin(first, options);
    expect(room.state.players[0]?.displayName).toBe("Unlimited");
    expect(await room.onAuth(fakeClient("standard"), { displayName: "Standard", deck: RED_DECK })).toBe(false);
    const standard = makeRoom();
    expect(await standard.onAuth(fakeClient("crafted"), options)).toBe(false);
    expect(() => standard.onJoin(fakeClient("bypass"), options)).toThrow(/illegal deck/);
  });

  it("frees the seat of a join rejected for an illegal deck so the next player takes it", () => {
    const room = makeRoom();
    const rejected = fakeClient("rejected");
    const illegalDeck = { mainDeck: [...RED_DECK.mainDeck], eggDeck: [...RED_DECK.eggDeck] };
    illegalDeck.mainDeck.splice(0, 4, ...Array<string>(4).fill("BT5-109"));
    room.clients.push(rejected);
    expect(() => room.onJoin(rejected, { displayName: "Rejected", deck: illegalDeck })).toThrow(/illegal deck/);
    room.clients.splice(room.clients.indexOf(rejected), 1);
    void room.onLeave(rejected);

    const next = fakeClient("next");
    room.clients.push(next);
    room.onJoin(next, { displayName: "Next", deck: RED_DECK });

    expect(room.state.players[0]?.displayName).toBe("Next");
    expect(() => room.broadcastPatch()).not.toThrow();
  });
  it("requires explicit opt-in from both seats of a beta battle room", async () => {
    const room = makeRoom({ betaBattleRoom: true });
    const first = fakeClient("beta-first");
    const betaDeck = { mainDeck: [...RED_DECK.mainDeck], eggDeck: [...RED_DECK.eggDeck] };
    betaDeck.mainDeck[0] = "EX13-007";
    const firstOptions = { displayName: "Beta first", deck: betaDeck, betaBattleMode: true };
    expect(await room.onAuth(first, firstOptions)).toBe(true);
    room.clients.push(first);
    room.onJoin(first, firstOptions);
    const second = fakeClient("beta-second");
    expect(await room.onAuth(second, { displayName: "Beta second", deck: RED_DECK })).toBe(false);
    const secondOptions = { displayName: "Beta second", deck: RED_DECK, betaBattleMode: true };
    expect(await room.onAuth(second, secondOptions)).toBe(true);
    room.clients.push(second);
    room.onJoin(second, secondOptions);
    intentSender(room)(first, { type: "ready" });
    intentSender(room)(second, { type: "ready" });
    const player = room.state.players[0]!;
    expect([...player.deck, ...player.hand].some(({ cardId }) => cardId === "EX13-007")).toBe(true);
  });

  it("seats an unreleased-product deck in a private room without a beta flag", async () => {
    const room = makeRoom({ betaBattleRoom: true, private: true });
    const betaDeck = { mainDeck: [...RED_DECK.mainDeck], eggDeck: [...RED_DECK.eggDeck] };
    betaDeck.mainDeck[0] = "EX13-007";
    const host = fakeClient("private-host");
    const hostOptions = { displayName: "Host", deck: betaDeck };
    expect(await room.onAuth(host, hostOptions)).toBe(true);
    room.clients.push(host);
    room.onJoin(host, hostOptions);
    const guest = fakeClient("private-guest");
    const guestOptions = { displayName: "Guest", deck: betaDeck, roomCode: room.state.roomCode };
    expect(await room.onAuth(guest, guestOptions)).toBe(true);
    room.clients.push(guest);
    room.onJoin(guest, guestOptions);
    intentSender(room)(host, { type: "ready" });
    intentSender(room)(guest, { type: "ready" });
    const player = room.state.players[0]!;
    expect([...player.deck, ...player.hand].some(({ cardId }) => cardId === "EX13-007")).toBe(true);
  });

  it("cannot opt a normal room into beta by a join payload", async () => {
    const room = makeRoom();
    expect(
      await room.onAuth(fakeClient("beta-forged"), {
        displayName: "Beta forged",
        deck: RED_DECK,
        betaBattleMode: true,
      }),
    ).toBe(false);
  });

  it("rejects duplicate nicknames in the same room case-insensitively", async () => {
    const room = makeRoom();
    const first = fakeClient("first-name");
    const second = fakeClient("second-name");
    const firstOptions = { displayName: "Tamer", deck: EMPTY_DECK };
    expect(await room.onAuth(first, firstOptions)).toBe(true);
    room.clients.push(first);
    room.onJoin(first, firstOptions);
    expect(await room.onAuth(second, { displayName: "tAMER", deck: EMPTY_DECK })).toBe(false);
  });

  it("does not start the match after both seats join without ready", () => {
    const room = makeRoom();
    joinBothSeats(room);
    expect(broadcastedEvents(room).some((e) => e.kind === "matchStarted")).toBe(false);
  });

  it("starts the match once both seats send ready", () => {
    const room = makeRoom();
    const [a, b] = joinBothSeats(room);
    const handleIntent = (
      room as unknown as {
        handleIntent: (c: Client, i: { type: string }) => void;
      }
    ).handleIntent.bind(room);

    handleIntent(a, { type: "ready" });
    expect(broadcastedEvents(room).some((e) => e.kind === "matchStarted")).toBe(false);

    handleIntent(b, { type: "ready" });
    expect(broadcastedEvents(room).some((e) => e.kind === "matchStarted")).toBe(true);
  });

  it("the ready-timeout fallback and the ready gate are idempotent together", () => {
    const room = makeRoom();
    joinBothSeats(room);
    const startMatchSpy = vi.spyOn((room as unknown as { engine: { startMatch: () => void } }).engine, "startMatch");

    (room as unknown as { startMatchNow: () => void }).startMatchNow();
    (room as unknown as { startMatchNow: () => void }).startMatchNow();

    expect(startMatchSpy).toHaveBeenCalledTimes(1);
  });

  it("requires the connected player's secret token before adding a bot", () => {
    const room = makeRoom();
    room.roomId = "casual-room";
    const human = fakeClient("human");
    human.reconnectionToken = "private-token";
    room.clients.push(human);
    room.onJoin(human, { displayName: "Human", deck: RED_DECK });
    const addBot = vi.spyOn(room, "addBot").mockReturnValue(true);
    for (const reconnectionToken of ["", "casual-room:human", "other-room:private-token", "casual-room:wrong-token"]) {
      expect(room.requestBot({ reconnectionToken })).toBe(403);
    }
    expect(addBot).not.toHaveBeenCalled();
    expect(room.requestBot({ reconnectionToken: "casual-room:private-token", botDeckId: "chosen-deck" })).toBe(200);
    expect(addBot).toHaveBeenCalledWith({ botDeckId: "chosen-deck", botDifficulty: undefined, botStyle: undefined });
    addBot.mockReturnValue(false);
    expect(room.requestBot({ reconnectionToken: "casual-room:private-token" })).toBe(409);
    human.reconnectionToken = "rotated-token";
    expect(room.requestBot({ reconnectionToken: "casual-room:private-token" })).toBe(403);
    expect(room.requestBot({ reconnectionToken: "casual-room:rotated-token" })).toBe(409);
    room.clients.splice(0);
    expect(room.requestBot({ reconnectionToken: "casual-room:rotated-token" })).toBe(403);
  });

  it("refuses bot requests from a connected client without a player seat", () => {
    const room = makeRoom();
    room.roomId = "casual-room";
    const observer = fakeClient("observer");
    observer.reconnectionToken = "observer-token";
    room.clients.push(observer);
    const addBot = vi.spyOn(room, "addBot");
    expect(room.requestBot({ reconnectionToken: "casual-room:observer-token" })).toBe(403);
    expect(addBot).not.toHaveBeenCalled();
  });

  it("addBot seats a bot in a dedicated bot room and starts without waiting for ready", () => {
    const room = makeRoom({ botRoom: true });
    // Production attaches the room state to an Encoder before clients join. Keep
    // this test on that real StateView lifecycle so detached schema nodes crash it.
    // eslint-disable-next-line no-new -- constructing the Encoder wires the state root
    new Encoder(room.state);
    const human = fakeClient("session-human");
    room.clients.push(human);
    room.onJoin(human, { displayName: "Human", deck: RED_DECK });

    expect(room.addBot({ botDifficulty: "beginner", botStyle: "defensive" })).toBe(true);

    const bot = room.state.players[1];
    const version = room.state.stateVersion;
    expect(room.addBot({ botDifficulty: "master", botStyle: "aggressive" })).toBe(true);
    expect(room.state.players[1]).toBe(bot);
    expect(room.state.stateVersion).toBe(version);
    expect(broadcastedEvents(room).filter((e) => e.kind === "matchStarted")).toHaveLength(1);

    expect(broadcastedEvents(room).some((e) => e.kind === "matchStarted")).toBe(true);
  });

  it("logs bot difficulty, style, outcomes and decision latency in completed matches", async () => {
    const room = makeRoom();
    room.state.turnCount = 12;
    const debug = vi.spyOn(room as unknown as { debug: (...args: unknown[]) => void }, "debug");
    const internals = room as unknown as {
      botLevelSettings: ({ difficulty: "master"; style: "aggressive" } | undefined)[];
      bots: (unknown | undefined)[];
      botExperimentRecord?: { botExperiment: string; botArm: "legacy" };
      recordRecentResults: (event: Extract<ServerEvent, { kind: "gameOver" }>) => Promise<void>;
    };
    internals.botLevelSettings[1] = { difficulty: "master", style: "aggressive" };
    internals.bots[1] = {
      policyName: "test-search",
      policyDecisionLatencySummary: { decisions: 20, p50Ms: 80, p95Ms: 310, maxMs: 410 },
      inferenceFallbacks: { timeout: 1, error: 0 },
    };
    internals.botExperimentRecord = { botExperiment: "standard-rollout", botArm: "legacy" };

    await internals.recordRecentResults({
      kind: "gameOver",
      result: { outcome: "win", winnerSeat: 1 },
      reason: "surrender",
    });

    expect(debug).toHaveBeenCalledWith(
      "bot.level.result",
      expect.objectContaining({
        seat: 1,
        botDifficulty: "master",
        botStyle: "aggressive",
        botResult: "win",
        concededByOpponent: true,
        gameLengthTurns: 12,
        policyName: "test-search",
        policyDecisionLatencyMs: { decisions: 20, p50Ms: 80, p95Ms: 310, maxMs: 410 },
        inferenceFallbacks: { timeout: 1, error: 0 },
        botExperiment: "standard-rollout",
        botArm: "legacy",
      }),
    );
  });

  it("seats an unreleased-product deck in a bot room without a beta flag", async () => {
    const room = makeRoom({ botRoom: true, betaBattleRoom: true });
    const human = fakeClient("session-beta-human");
    const betaDeck = { mainDeck: [...RED_DECK.mainDeck], eggDeck: [...RED_DECK.eggDeck] };
    betaDeck.mainDeck[0] = "EX13-007";
    const options = { displayName: "Beta Human", deck: betaDeck };
    expect(await room.onAuth(human, options)).toBe(true);
    room.clients.push(human);
    room.onJoin(human, options);
    room.addBot();

    expect(broadcastedEvents(room).some((event) => event.kind === "matchStarted")).toBe(true);
  });

  it("GitHub #5236: seats the exact validated personal deck for the bot and rejects illegal decks", async () => {
    const room = makeRoom({ botRoom: true });
    new Encoder(room.state);
    const human = fakeClient("personal-bot-human");
    const botDeck = { mainDeck: [...BLUE_DECK.mainDeck], eggDeck: [...BLUE_DECK.eggDeck] };
    const options = { displayName: "Human", deck: RED_DECK, botDeck };
    expect(await room.onAuth(human, options)).toBe(true);
    room.clients.push(human);
    room.onJoin(human, options);
    expect(room.addBot()).toBe(true);
    const bot = room.state.players[1]!;
    expect([...bot.deck, ...bot.hand, ...bot.security].map((card) => card.cardId).sort()).toEqual(
      [...botDeck.mainDeck].sort(),
    );
    const illegal = makeRoom({ botRoom: true });
    expect(await illegal.onAuth(fakeClient("illegal"), { ...options, botDeck: { mainDeck: [], eggDeck: [] } })).toBe(
      false,
    );
    expect(() => illegal.onJoin(fakeClient("illegal"), { ...options, botDeck: { mainDeck: [], eggDeck: [] } })).toThrow(
      /Illegal custom bot deck/,
    );
    expect(await makeRoom().onAuth(fakeClient("casual"), options)).toBe(false);
  });
  it("addBot deals the bot the requested famous-deck preset", () => {
    const requested = ALL_FAMOUS_DECKS.find(isFamousDeckAvailable);
    expect(requested).toBeDefined();
    const room = makeRoom({ botRoom: true });
    // eslint-disable-next-line no-new -- constructing the Encoder wires the state root
    new Encoder(room.state);
    const human = fakeClient("session-human-deck");
    room.clients.push(human);
    room.onJoin(human, { displayName: "Human", deck: RED_DECK });

    room.addBot(requested!.deckId);

    // The match has started and dealt, so the preset's 50 cards are spread over the
    // bot's zones; the total is what proves WHICH deck was seated.
    const bot = room.state.players[1]!;
    const dealtTotal = bot.deck.length + bot.hand.length + bot.security.length;
    expect(dealtTotal).toBe(requested!.decklist.mainDeck.length);
    expect(bot.eggDeck.length).toBe(requested!.decklist.eggDeck.length);
    const dealtIds = [...bot.deck, ...bot.hand, ...bot.security].map((card) => card.cardId).sort();
    expect(dealtIds).toEqual([...requested!.decklist.mainDeck].sort());
  });

  it("advances past mulligan after the human keeps and the bot answers", async () => {
    vi.useFakeTimers();
    const room = makeRoom({ botRoom: true, seed: 2 });
    // eslint-disable-next-line no-new -- constructing the Encoder wires the state root
    new Encoder(room.state);
    const human = fakeClient("session-human-mulligan");
    room.clients.push(human);
    room.onJoin(human, { displayName: "Human", deck: RED_DECK });
    room.addBot();

    expect(room.state.pendingDecision).toMatchObject({ seat: 0, kind: "mulligan" });
    const handleIntent = (
      room as unknown as {
        handleIntent: (client: Client, intent: { type: "mulligan"; keep: boolean }) => void;
      }
    ).handleIntent.bind(room);
    handleIntent(human, { type: "mulligan", keep: true });
    await Promise.resolve();
    expect(room.state.pendingDecision).toMatchObject({ seat: 1, kind: "mulligan" });

    // Past the ceiling of the bot's think-time window, wherever in it this seed lands.
    await vi.advanceTimersByTimeAsync(DEFAULT_MAX_ACTION_DELAY_MS);

    expect(room.state.pendingDecision).toBeUndefined();
    expect(room.state.turnCount).toBe(1);
  });

  it("keeps casual bot seating compatible with web bundles loaded before the rollout", () => {
    const room = makeRoom();
    const human = fakeClient("session-human");
    room.clients.push(human);
    room.onJoin(human, { displayName: "Human", deck: EMPTY_DECK });

    expect(room.addBot()).toBe(true);
    expect(broadcastedEvents(room).some((event) => event.kind === "matchStarted")).toBe(true);
  });

  it("limits dedicated bot rooms to one human client", () => {
    const room = makeRoom({ botRoom: true });

    expect(room.maxClients).toBe(1);
  });

  it("reseats a fresh queued player instead of retaining the departed identity", async () => {
    const room = makeRoom();
    const departed = fakeClient("departed");
    room.clients.push(departed);
    room.onJoin(departed, { displayName: "Departed", deck: EMPTY_DECK });
    room.clients.splice(0, 1);
    await room.onLeave(departed, CloseCode.CONSENTED);

    const replacement = fakeClient("replacement");
    room.clients.push(replacement);
    room.onJoin(replacement, { displayName: "Replacement", deck: EMPTY_DECK });

    expect(room.state.players[0]?.sessionId).toBe("replacement");
    expect(room.state.players[0]?.displayName).toBe("Replacement");
  });

  it("requires a replacement player to send their own ready intent", async () => {
    const room = makeRoom();
    const [departed, opponent] = joinBothSeats(room);
    const handleIntent = (
      room as unknown as { handleIntent: (client: Client, intent: { type: string }) => void }
    ).handleIntent.bind(room);
    handleIntent(departed, { type: "ready" });
    room.clients.splice(0, 1);
    await room.onLeave(departed, CloseCode.CONSENTED);
    const replacement = fakeClient("replacement-ready");
    room.clients.push(replacement);
    room.onJoin(replacement, { displayName: "Replacement", deck: EMPTY_DECK });

    handleIntent(opponent, { type: "ready" });
    expect(broadcastedEvents(room).some((event) => event.kind === "matchStarted")).toBe(false);
    handleIntent(replacement, { type: "ready" });
    expect(broadcastedEvents(room).some((event) => event.kind === "matchStarted")).toBe(true);
  });
});

/**
 * The presentation stream contract (docs/presentation-queue-plan.md section 3.1): every event
 * carries its position in the room's stream and the batch the rules produced it in, and each
 * batch that said anything is ended by exactly one `batchClosed`.
 */
describe("AegisRoom sequenced event batches", () => {
  afterEach(() => vi.useRealTimers());

  function startedBotRoom(): { room: AegisRoom; human: Client } {
    const room = makeRoom({ botRoom: true, seed: 2 });
    // eslint-disable-next-line no-new -- constructing the Encoder wires the state root
    new Encoder(room.state);
    const human = fakeClient("session-human-batches");
    room.clients.push(human);
    room.onJoin(human, { displayName: "Human", deck: RED_DECK });
    room.addBot();
    return { room, human };
  }

  it("numbers every broadcast event monotonically with no gaps", () => {
    const { room } = startedBotRoom();
    const seqs = sequencedEvents(room).map((event) => event.seq);

    expect(seqs.length).toBeGreaterThan(1);
    expect(seqs).toEqual(seqs.map((_, index) => index + 1));
  });

  it("stamps every event with the batch it was emitted in", () => {
    const { room } = startedBotRoom();

    for (const event of sequencedEvents(room)) {
      expect(typeof event.batch).toBe("string");
      expect(event.batch).not.toBe("");
      expect(typeof event.stateVersion).toBe("number");
    }
  });

  it("closes each batch that emitted events exactly once, after the state patch", () => {
    const { room } = startedBotRoom();
    const events = sequencedEvents(room);
    const batchesWithEvents = new Set(events.filter((event) => event.kind !== "batchClosed").map((e) => e.batch));
    const closes = events.filter((event) => event.kind === "batchClosed");

    expect(closes.map((close) => close.kind === "batchClosed" && close.batch).sort()).toEqual(
      [...batchesWithEvents].sort(),
    );
    const closeOptions = recordedBroadcasts(room)
      .filter(([type, message]) => type === EVENT_CHANNEL && (message as ServerEvent).kind === "batchClosed")
      .map(([, , options]) => options?.afterNextPatch);
    expect(closeOptions.every((afterNextPatch) => afterNextPatch === true)).toBe(true);
  });

  it("sends each shared batch's state patch at its own revision, so no revision is skipped", () => {
    const room = makeRoom({ botRoom: true, seed: 2 });
    // eslint-disable-next-line no-new -- constructing the Encoder wires the state root
    new Encoder(room.state);
    const log = recordedBroadcasts(room);
    const patchedVersions: number[] = [];
    const broadcastPatch = room.broadcastPatch.bind(room);
    room.broadcastPatch = vi.fn<AegisRoom["broadcastPatch"]>(() => {
      patchedVersions.push(room.state.stateVersion);
      log.push(["@patch", room.state.stateVersion, undefined]);
      return broadcastPatch();
    });
    const human = fakeClient("session-human-patches");
    room.clients.push(human);
    room.onJoin(human, { displayName: "Human", deck: RED_DECK });
    room.addBot();

    const closes = log.flatMap(([type, message], index) =>
      type === EVENT_CHANNEL && (message as ServerEvent).kind === "batchClosed" ? [index] : [],
    );
    expect(closes.length).toBeGreaterThan(0);
    for (const index of closes) {
      const close = log[index]![1] as Extract<ServerEvent, { kind: "batchClosed" }>;
      expect(log[index + 1]).toEqual(["@patch", close.stateVersion, undefined]);
    }
    const closedVersions = closes.map((index) => (log[index]![1] as { stateVersion: number }).stateVersion);
    expect(closedVersions.every((version) => patchedVersions.includes(version))).toBe(true);
  });

  it("names the last event of the batch in its close", () => {
    const { room } = startedBotRoom();
    const events = sequencedEvents(room);

    for (const close of events) {
      if (close.kind !== "batchClosed") continue;
      const inBatch = events.filter((event) => event.batch === close.batch && event.kind !== "batchClosed");
      expect(close.lastSeq).toBe(inBatch.at(-1)!.seq);
    }
  });

  it("reuses the open batch for an entry nested inside it", () => {
    const room = makeRoom();
    const [a, b] = joinBothSeats(room);
    const handleIntent = intentSender(room);

    handleIntent(a, { type: "ready" });
    const before = sequencedEvents(room).length;
    // The second `ready` closes the gate, so the engine starts the match from inside this
    // intent: one entry nested in another must not split the moment into two batches.
    handleIntent(b, { type: "ready" });

    const started = sequencedEvents(room).slice(before);
    const batches = new Set(started.map((event) => event.batch));
    expect(started.some((event) => event.kind === "matchStarted")).toBe(true);
    expect(batches.size).toBe(1);
    expect(started.filter((event) => event.kind === "batchClosed")).toHaveLength(1);
  });

  it("closes a batch on the state revision the batch produced", () => {
    const room = makeRoom();
    const [a, b] = joinBothSeats(room);
    const handleIntent = intentSender(room);
    handleIntent(a, { type: "ready" });
    handleIntent(b, { type: "ready" });

    const closes = sequencedEvents(room).filter((event) => event.kind === "batchClosed");
    expect(closes.length).toBeGreaterThan(0);
    const last = closes.at(-1)!;
    expect(last.kind === "batchClosed" && last.stateVersion).toBe(room.state.stateVersion);
    // Each close raises the revision by one, so a client can pair a patch with a batch.
    expect(room.state.stateVersion).toBe(closes.length);
  });

  it("stamps a rejection and gives it a batch of its own", () => {
    const room = makeRoom();
    const [a] = joinBothSeats(room);
    const handleIntent = intentSender(room);

    handleIntent(a, { type: "playCard", instanceId: "not-a-card" } as { type: string });

    const sent = (a.send as unknown as { mock: { calls: [string, unknown][] } }).mock.calls.filter(
      ([channel]) => channel === EVENT_CHANNEL,
    );
    const rejection = sent
      .map(([, message]) => message as SequencedServerEvent)
      .find((e) => e.kind === "actionRejected");
    expect(rejection).toBeDefined();
    expect(rejection!.seq).toBeGreaterThan(0);
    expect(rejection!.batch).not.toBe("");
    // The refusal is nobody else's business, and it changed no state to patch.
    expect(broadcastedEvents(room).some((event) => event.kind === "actionRejected")).toBe(false);
    const close = sent
      .map(([, message]) => message as SequencedServerEvent)
      .find((event) => event.kind === "batchClosed");
    expect(close).toBeDefined();
    expect(close!.batch).toBe(rejection!.batch);
  });

  it("correlates a refused decision answer and keeps it open for a valid retry", async () => {
    const room = makeRoom();
    const [a, b] = joinBothSeats(room);
    room.broadcastPatch = vi.fn<AegisRoom["broadcastPatch"]>(() => false);
    const manager = (room as unknown as { engine: { decisions: DecisionManager } }).engine.decisions;
    const resolution = manager.request({
      seat: 0,
      kind: "selectCards",
      promptText: "Select 1",
      options: { candidateInstanceIds: ["only"], min: 1, max: 1 },
    });
    const decisionId = room.state.pendingDecision!.decisionId;
    const handleIntent = (
      room as unknown as {
        handleIntent: (
          client: Client,
          intent: { type: string; decisionId: string; response: { kind: "selectCards"; instanceIds: string[] } },
        ) => void;
      }
    ).handleIntent.bind(room);
    vi.mocked(a.send).mockClear();
    vi.mocked(b.send).mockClear();
    handleIntent(a, { type: "respondDecision", decisionId, response: { kind: "selectCards", instanceIds: [] } });
    expect(a.send).toHaveBeenCalledWith(
      EVENT_CHANNEL,
      expect.objectContaining({ kind: "actionRejected", intent: "respondDecision", decisionId }),
    );
    expect(b.send).not.toHaveBeenCalled();
    expect(room.state.pendingDecision?.decisionId).toBe(decisionId);
    handleIntent(a, { type: "respondDecision", decisionId, response: { kind: "selectCards", instanceIds: ["only"] } });
    await expect(resolution).resolves.toEqual({ kind: "selectCards", instanceIds: ["only"] });
    expect(room.state.pendingDecision).toBeUndefined();
  });

  it("stamps a decision with the revision the board will be at when it is asked", () => {
    const room = makeRoom();
    const [a] = joinBothSeats(room);
    const request = { decisionId: "dec-1", seat: 0 as const, kind: "optional" as const, promptText: "Activate?" };
    const ask = (room as unknown as { requestDecision: (seat: 0 | 1, req: typeof request) => void }).requestDecision;
    const sentDecisions = () =>
      (a.send as unknown as { mock: { calls: [string, { stateVersion?: number }][] } }).mock.calls
        .filter(([channel]) => channel === DECISION_CHANNEL)
        .map(([, message]) => message);

    // Raised inside a batch: that batch has not closed yet, so the answer belongs to the
    // revision its close will produce.
    const withinBatch = (room as unknown as { withBatch: <T>(run: () => T) => T }).withBatch.bind(room);
    const before = room.state.stateVersion;
    withinBatch(() => {
      (room as unknown as { stamp: (e: ServerEvent) => unknown }).stamp({ kind: "matchStarted", firstSeat: 0 });
      ask.call(room, 0, request);
    });
    expect(sentDecisions().at(-1)?.stateVersion).toBe(before + 1);

    // Raised with nothing open: the board is already at the revision the question is about.
    ask.call(room, 0, { ...request, decisionId: "dec-2" });
    expect(sentDecisions().at(-1)?.stateVersion).toBe(room.state.stateVersion);
  });
});

describe("AegisRoom combat windows", () => {
  afterEach(() => vi.useRealTimers());

  /** Park a block window on the room's synchronized state, as the combat controller would. */
  function openBlockWindow(room: AegisRoom, seat: 0 | 1): void {
    const window = new CombatWindow();
    window.kind = "block";
    window.seat = seat;
    window.attackerPermanentId = "attacker";
    window.eligiblePermanentIds = new ArraySchema<string>("blocker");
    room.state.combatWindow = window;
  }

  it("re-sends the complete pending decision only to its deciding seat", () => {
    const room = makeRoom();
    const [a, b] = joinBothSeats(room);
    room.broadcastPatch = vi.fn<AegisRoom["broadcastPatch"]>(() => false);
    const request: DecisionRequest = {
      decisionId: "dec-reconnect",
      seat: 0,
      kind: "orderTriggers",
      promptText: "Choose the next effect",
      sourceCardId: "BT1-010",
      options: { triggerKeys: ["first", "second"], triggerCardIds: ["BT1-010", "BT1-011"] },
    };
    const pending = new PendingDecision();
    Object.assign(pending, { ...request, payloadJson: JSON.stringify(request.options) });
    room.state.pendingDecision = pending;
    (room as unknown as { requestDecision: (seat: number, req: DecisionRequest) => void }).requestDecision(0, request);
    vi.mocked(a.send).mockClear();
    vi.mocked(b.send).mockClear();
    room.state.stateVersion = 7;
    const resend = (
      room as unknown as { resendOpenPrompts: (client: Client, seat: number) => void }
    ).resendOpenPrompts.bind(room);
    resend(a, 0);
    resend(b, 1);
    expect(a.send).toHaveBeenCalledWith(DECISION_CHANNEL, { ...request, stateVersion: 7 });
    expect(b.send).not.toHaveBeenCalled();
  });

  describe("reconnect grace", () => {
    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    function droppedMatch() {
      vi.useFakeTimers();
      const room = makeRoom();
      const [, dropped] = joinBothSeats(room);
      (dropped as unknown as { reconnectionToken: string }).reconnectionToken = "token-b";
      room.state.phase = Phase.Main;
      (room as unknown as { matchStartRequested: boolean }).matchStartRequested = true;
      room.broadcastPatch = vi.fn<AegisRoom["broadcastPatch"]>(() => false);
      let resolve!: (client: Client) => void;
      let reject!: (reason: unknown) => void;
      const reconnection = Object.assign(
        new Promise<Client>((done, fail) => {
          resolve = done;
          reject = fail;
        }),
        { resolve, reject },
      );
      room.allowReconnection = vi.fn(() => reconnection) as unknown as AegisRoom["allowReconnection"];
      vi.spyOn(Room.prototype, "checkReconnectionToken").mockReturnValue(dropped.sessionId);
      const elapse = async (ms: number) => {
        await vi.advanceTimersByTimeAsync(ms);
        room.clock.tick();
        await vi.advanceTimersByTimeAsync(0);
      };
      const departure = room.onLeave(dropped, CloseCode.ABNORMAL_CLOSURE);
      return { room, dropped, departure, elapse, reconnect: (client: Client) => resolve(client) };
    }

    it("#5257 grants 60 seconds to reconnect and awards the connected opponent the win on expiry", async () => {
      const { room, dropped, departure, elapse } = droppedMatch();
      await elapse(0);
      expect(room.allowReconnection).toHaveBeenCalledWith(dropped, "manual");
      expect(room.state.players[1]!.connected).toBe(false);

      await elapse(59_999);
      expect(room.state.gameOver).toBe(false);
      await elapse(1);
      await departure;
      expect(room.state.gameOver).toBe(true);
      expect(room.state.winnerSeat).toBe(0);
    });

    it("keeps the seat for a reconnect accepted moments before the grace runs out", async () => {
      const { room, dropped, departure, elapse, reconnect } = droppedMatch();
      await elapse(59_700);
      expect(room.checkReconnectionToken("token-b")).toBe(dropped.sessionId);

      await elapse(1_400);
      expect(room.state.gameOver).toBe(false);
      const back = fakeClient(dropped.sessionId);
      room.clients.push(back);
      reconnect(back);
      await departure;
      expect(room.state.gameOver).toBe(false);
      expect(room.state.players[1]!.connected).toBe(true);
    });

    it("releases a seat whose accepted reconnect never opens its socket", async () => {
      const { room, departure, elapse } = droppedMatch();
      await elapse(59_700);
      room.checkReconnectionToken("token-b");

      await elapse(14_999);
      expect(room.state.gameOver).toBe(false);
      await elapse(1);
      await departure;
      expect(room.state.gameOver).toBe(true);
      expect(room.state.winnerSeat).toBe(0);
    });

    it("does not shorten the grace when a reconnect is accepted early", async () => {
      const { room, departure, elapse } = droppedMatch();
      await elapse(5_000);
      room.checkReconnectionToken("token-b");

      await elapse(54_999);
      expect(room.state.gameOver).toBe(false);
      await elapse(1);
      await departure;
      expect(room.state.gameOver).toBe(true);
    });
  });

  it("re-sends the pending decision to the reconnected client (Discord 1555741214014447737)", async () => {
    const room = makeRoom();
    const [a] = joinBothSeats(room);
    room.broadcastPatch = vi.fn<AegisRoom["broadcastPatch"]>(() => false);
    const request: DecisionRequest = {
      decisionId: "dec-refresh",
      seat: 0,
      kind: "orderTriggers",
      promptText: "Choose the next pending effect to resolve.",
      options: { triggerKeys: ["first", "second"], triggerCardIds: ["BT26-072", "BT26-082"] },
    };
    const pending = new PendingDecision();
    Object.assign(pending, { ...request, payloadJson: JSON.stringify(request.options) });
    room.state.pendingDecision = pending;
    (room as unknown as { requestDecision: (seat: number, req: DecisionRequest) => void }).requestDecision(0, request);
    vi.mocked(a.send).mockClear();
    const reconnected = fakeClient("session-a");
    room.allowReconnection = vi.fn(async () => reconnected) as unknown as AegisRoom["allowReconnection"];
    room.lock = vi.fn(async () => undefined) as AegisRoom["lock"];
    room.unlock = vi.fn(async () => undefined) as AegisRoom["unlock"];

    await room.onLeave(a, CloseCode.ABNORMAL_CLOSURE);

    expect(reconnected.send).toHaveBeenCalledWith(
      DECISION_CHANNEL,
      expect.objectContaining({ decisionId: "dec-refresh" }),
    );
    expect(a.send).not.toHaveBeenCalledWith(DECISION_CHANNEL, expect.anything());
  });

  it("re-sends the open combat window to a seat that reconnects into it", () => {
    const room = makeRoom();
    const [a] = joinBothSeats(room);
    openBlockWindow(room, 0);

    (room as unknown as { resendOpenPrompts: (c: Client, s: number) => void }).resendOpenPrompts.call(room, a, 0);

    const sent = (a.send as unknown as { mock: { calls: [string, ServerEvent][] } }).mock.calls
      .filter(([channel]) => channel === EVENT_CHANNEL)
      .map(([, event]) => event);
    expect(sent.find((event) => event.kind === "blockWindowOpened")).toMatchObject({
      attackerPermanentId: "attacker",
      eligibleBlockerIds: ["blocker"],
    });
  });

  it("sends nothing to the seat the window is not asking", () => {
    const room = makeRoom();
    const [, b] = joinBothSeats(room);
    openBlockWindow(room, 0);

    (room as unknown as { resendOpenPrompts: (c: Client, s: number) => void }).resendOpenPrompts.call(room, b, 1);

    const sent = (b.send as unknown as { mock: { calls: [string, ServerEvent][] } }).mock.calls;
    expect(sent.some(([, event]) => (event as ServerEvent).kind === "blockWindowOpened")).toBe(false);
  });

  /** Drive the room's emit hook the way the engine does, so the room tracks the check itself. */
  function emitToRoom(room: AegisRoom, event: ServerEvent): void {
    (room as unknown as { engine: { hooks: { emit: (e: ServerEvent) => void } } }).engine.hooks.emit(event);
  }

  const REVEAL: ServerEvent = {
    kind: "securityRevealed",
    seat: 0,
    revealedCardId: "EX12-076",
    attackerPermanentId: "attacker",
    securityCardDP: 16000,
    attackerDP: 11000,
    hasSecurityEffect: false,
    isDigimon: true,
  };

  function revealsSentTo(client: Client): ServerEvent[] {
    return (client.send as unknown as { mock: { calls: [string, ServerEvent][] } }).mock.calls
      .filter(([channel, event]) => channel === EVENT_CHANNEL && event.kind === "securityRevealed")
      .map(([, event]) => event);
  }

  it("re-sends the reveal of a check still open, to both seats", () => {
    const room = makeRoom();
    const [a, b] = joinBothSeats(room);
    emitToRoom(room, REVEAL);
    vi.mocked(a.send).mockClear();
    vi.mocked(b.send).mockClear();

    const resend = (
      room as unknown as { resendOpenPrompts: (client: Client, seat: number) => void }
    ).resendOpenPrompts.bind(room);
    resend(a, 0);
    resend(b, 1);

    // The check is a scene both clients hold open, so neither is gated out of it.
    expect(revealsSentTo(a).at(0)).toMatchObject({ revealedCardId: "EX12-076", attackerDP: 11000 });
    expect(revealsSentTo(b).at(0)).toMatchObject({ revealedCardId: "EX12-076", attackerDP: 11000 });
  });

  it("stops re-sending once the check has closed", () => {
    const room = makeRoom();
    const [a] = joinBothSeats(room);
    emitToRoom(room, REVEAL);
    emitToRoom(room, {
      kind: "securityChecked",
      seat: 0,
      revealedCardId: "EX12-076",
      resolution: "battle",
      battle: { securityDigimonDeleted: false, attackerDeleted: true, attackerDP: 11000, securityCardDP: 16000 },
    });
    vi.mocked(a.send).mockClear();

    (room as unknown as { resendOpenPrompts: (c: Client, s: number) => void }).resendOpenPrompts.call(room, a, 0);

    // Resending here would replay a scene the client has already been shown in full.
    expect(revealsSentTo(a)).toHaveLength(0);
  });

  it("closes a combat window nobody ever answers, so the match cannot wedge", () => {
    vi.useFakeTimers();
    const room = makeRoom();
    joinBothSeats(room);
    const expire = vi.spyOn(
      (room as unknown as { engine: { expireCombatWindow: () => boolean } }).engine,
      "expireCombatWindow",
    );

    openBlockWindow(room, 0);
    (room as unknown as { syncCombatWindowTimeout: () => void }).syncCombatWindowTimeout.call(room);

    const timeoutMs =
      (room as unknown as { COMBAT_WINDOW_TIMEOUT_SECONDS: number }).COMBAT_WINDOW_TIMEOUT_SECONDS * 1000;
    // The grace period a dropped player gets to come back and answer must elapse first.
    vi.advanceTimersByTime((room as unknown as { RECONNECT_GRACE_SECONDS: number }).RECONNECT_GRACE_SECONDS * 1000);
    room.clock.tick();
    expect(expire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(timeoutMs);
    room.clock.tick();
    expect(expire).toHaveBeenCalledTimes(1);
  });

  it("disarms the timeout once the window is answered", () => {
    vi.useFakeTimers();
    const room = makeRoom();
    joinBothSeats(room);
    const expire = vi.spyOn(
      (room as unknown as { engine: { expireCombatWindow: () => boolean } }).engine,
      "expireCombatWindow",
    );
    const sync = (room as unknown as { syncCombatWindowTimeout: () => void }).syncCombatWindowTimeout.bind(room);

    openBlockWindow(room, 0);
    sync();
    room.state.combatWindow = undefined;
    sync();

    vi.advanceTimersByTime(
      (room as unknown as { COMBAT_WINDOW_TIMEOUT_SECONDS: number }).COMBAT_WINDOW_TIMEOUT_SECONDS * 1000 * 2,
    );
    room.clock.tick();
    expect(expire).not.toHaveBeenCalled();
  });
});

describe("AegisRoom private room reopening", () => {
  function unstartedRoom(roomId: string): AegisRoom {
    const room = new AegisRoom();
    room.roomId = roomId;
    room.broadcast = vi.fn(() => true) as AegisRoom["broadcast"];
    return room;
  }

  function playPrivateGameToTheEnd(room: AegisRoom): void {
    room.lock = vi.fn(async () => undefined) as AegisRoom["lock"];
    const host = fakeClient("reopen-host");
    room.clients.push(host);
    room.onJoin(host, { displayName: "Host", deck: RED_DECK });
    const guest = fakeClient("reopen-guest");
    room.clients.push(guest);
    room.onJoin(guest, { displayName: "Guest", deck: RED_DECK, roomCode: room.state.roomCode });
    intentSender(room)(host, { type: "ready" });
    intentSender(room)(guest, { type: "ready" });
    intentSender(room)(host, { type: "surrender" });
  }

  it("frees its code once the game is over", async () => {
    const finished = unstartedRoom("finished-room");
    finished.onCreate({ seed: 1, private: true });
    playPrivateGameToTheEnd(finished);
    expect(finished.state.gameOver).toBe(true);

    const reopened = unstartedRoom("reopened-room");
    await reopened.onCreate({ seed: 2, private: true, roomCode: finished.state.roomCode });

    expect(reopened.state.roomCode).toBe(finished.state.roomCode);
    await expect(roomCodeDirectory().resolve(finished.state.roomCode)).resolves.toBe(reopened.roomId);
    finished.onDispose();
    await expect(roomCodeDirectory().resolve(finished.state.roomCode)).resolves.toBe(reopened.roomId);
    reopened.onDispose();
  });

  it("refuses a code that a live room still holds", async () => {
    const live = unstartedRoom("live-room");
    live.onCreate({ seed: 1, private: true });

    await expect(
      Promise.resolve(unstartedRoom("rival-room").onCreate({ private: true, roomCode: live.state.roomCode })),
    ).rejects.toThrow("still in use");
    live.onDispose();
  });
});

describe("AegisRoom full state sync guard", () => {
  type FullState = (client?: Client) => Uint8Array;
  const encoderFailure = () => new TypeError("Cannot read properties of undefined (reading 'Symbol($changes)')");

  function joinedRoom(): {
    room: AegisRoom;
    client: Client;
    sendFullState: (client: Client) => void;
    serializer: { getFullState: FullState };
  } {
    const room = makeRoom();
    const [client] = joinBothSeats(room);
    client.raw = vi.fn<Client["raw"]>();
    const sendFullState = (room as unknown as { sendFullState(client: Client): void }).sendFullState;
    // Colyseus keeps the serializer private; the guard is exercised through its real call path.
    const serializer = Reflect.get(room, "_serializer") as { getFullState: FullState };
    return { room, client, sendFullState, serializer };
  }

  it("rebuilds the seat's view and retries once when the full state encode throws", () => {
    const { client, sendFullState, serializer } = joinedRoom();
    const viewBeforeFailure = client.view;
    const fullState = new Uint8Array([1]);
    serializer.getFullState = vi
      .fn<FullState>()
      .mockImplementationOnce(() => {
        throw encoderFailure();
      })
      .mockReturnValue(fullState);

    expect(() => sendFullState(client)).not.toThrow();

    expect(client.view).not.toBe(viewBeforeFailure);
    expect(client.raw).toHaveBeenCalledWith(fullState);
  });

  it("closes only this room when the retry fails too, instead of throwing out of the socket handler", () => {
    const { room, client, sendFullState, serializer } = joinedRoom();
    room.disconnect = vi.fn<AegisRoom["disconnect"]>(async () => {});
    serializer.getFullState = vi.fn<FullState>(() => {
      throw encoderFailure();
    });

    expect(() => sendFullState(client)).not.toThrow();

    expect(client.raw).not.toHaveBeenCalled();
    expect(room.disconnect).toHaveBeenCalledWith(CloseCode.WITH_ERROR);
  });
});

describe("AegisRoom StateView lifecycle", () => {
  it("disposes every issued view with the room so a finished match can be collected", () => {
    const room = makeRoom();
    const [a, b] = joinBothSeats(room);
    const views = [a.view!, b.view!];
    const disposals = views.map((view) => vi.spyOn(view, "dispose"));

    room.onDispose();

    for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce();
  });

  it("disposes a replaced view instead of leaving it registered", async () => {
    const room = makeRoom();
    const [a] = joinBothSeats(room);
    const staleView = a.view!;
    const disposeStale = vi.spyOn(staleView, "dispose");
    const reconnected = fakeClient("session-a");
    reconnected.view = staleView;
    room.allowReconnection = vi.fn(async () => reconnected) as unknown as AegisRoom["allowReconnection"];
    room.broadcastPatch = vi.fn<AegisRoom["broadcastPatch"]>(() => false);
    room.lock = vi.fn(async () => undefined) as AegisRoom["lock"];
    room.unlock = vi.fn(async () => undefined) as AegisRoom["unlock"];

    await room.onLeave(a, CloseCode.ABNORMAL_CLOSURE);

    expect(disposeStale).toHaveBeenCalledOnce();
    expect(reconnected.view).not.toBe(staleView);
    room.onDispose();
    expect(disposeStale).toHaveBeenCalledOnce();
  });
});

it("rechecks player capacity before a late join can overwrite an occupied seat", () => {
  const room = makeRoom();
  const [first, second] = joinBothSeats(room);
  const intruder = fakeClient("third-client");
  expect(() => room.onJoin(intruder, { displayName: "Third", deck: EMPTY_DECK })).toThrow("Player seats are full");
  expect(room.state.players.map((player) => player.sessionId)).toEqual([first.sessionId, second.sessionId]);
  expect(intruder.view).toBeUndefined();
  room.onDispose();
});

describe("AegisRoom final reveal", () => {
  it("reveals every hidden zone right after the game is over", () => {
    const room = makeRoom();
    const host = fakeClient("reveal-host");
    room.clients.push(host);
    room.onJoin(host, { displayName: "Host", deck: RED_DECK });
    const guest = fakeClient("reveal-guest");
    room.clients.push(guest);
    room.onJoin(guest, { displayName: "Guest", deck: RED_DECK });
    intentSender(room)(host, { type: "ready" });
    intentSender(room)(guest, { type: "ready" });
    expect(broadcastedEvents(room).some((event) => event.kind === "finalReveal")).toBe(false);

    intentSender(room)(host, { type: "surrender" });

    const events = broadcastedEvents(room);
    const gameOverIndex = events.findIndex((event) => event.kind === "gameOver");
    const reveal = events[gameOverIndex + 1];
    expect(reveal?.kind).toBe("finalReveal");
    if (reveal?.kind !== "finalReveal") return;
    for (const player of room.state.players) {
      const revealed = reveal.players.find((entry) => entry.seat === player.seat)!;
      expect(revealed.hand.map((card) => card.cardId)).toEqual(player.hand.map((card) => card.cardId));
      expect(revealed.deck.map((card) => card.cardId)).toEqual(player.deck.map((card) => card.cardId));
      expect(revealed.security).toHaveLength(player.security.length);
      expect(revealed.hand.length).toBeGreaterThan(0);
    }
    room.onDispose();
  });
});
