import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientState, type Client } from "colyseus";
import { Phase, type Intent, type Seat } from "@aegis/shared";
import { RollbackKind } from "@aegis/shared/protocol/RollbackKind";
import { AegisRoom } from "#api/rooms/AegisRoom";
import { RED_DECK, BLUE_DECK } from "#api/engine/testDecks";
import fixture from "#api/engine/scenarios/matchRollback.fixture";
import decisionRollbackFixture from "#api/engine/scenarios/decisionRollbackHandAffordances.fixture";
import playCostReductionRollbackFixture from "#api/engine/scenarios/playCostReductionRollbackHandAffordances.fixture";
import { addLogSink } from "#api/logger";
import { extractReplay } from "#api/replays/inputs/extract";
import { runReplay } from "#api/replays/inputs/run";
import { comparableState } from "#api/replays/inputs/roomMatch.fixture";
import { Decoder, Encoder } from "@colyseus/schema";
import { GameState } from "@aegis/shared/schema/GameState";
import type { GameEngine } from "#api/engine/GameEngine";
import { createEvaluationPolicy } from "#api/bot/policy";
import { BotPlayer } from "#api/bot/BotPlayer";
import { pushOnStack } from "#api/engine/state/access";

const rooms: AegisRoom[] = [];

async function idle() {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}
function engine(room: AegisRoom): GameEngine {
  return Reflect.get(room, "engine");
}
function send(room: AegisRoom, seat: Seat, intent: Intent) {
  return Reflect.get(room, "applyLoggedIntent").call(room, seat, intent);
}
async function start(options: Record<string, unknown> = {}, board = fixture) {
  const room = new AegisRoom();
  Reflect.get(room, "__init").call(room);
  room.setPatchRate(null);
  rooms.push(room);
  room.lock = vi.fn<typeof room.lock>(async () => {});
  room.unlock = vi.fn<typeof room.unlock>(async () => {});
  room.setMatchmaking = vi.fn<typeof room.setMatchmaking>(async () => {});
  room.broadcast = vi.fn<typeof room.broadcast>(() => true) as AegisRoom["broadcast"];
  const persist = vi.fn<() => Promise<void>>(async () => {});
  Reflect.set(room, "accounts", () => ({ recordRecentMatch: persist }));
  const messageSpy = vi.spyOn(room, "onMessage");
  await room.onCreate({ seed: 0, allowRollback: true, ...options });
  const clients = [0, 1].map(
    (seat) =>
      ({
        sessionId: `seat-${seat}`,
        state: ClientState.JOINED,
        send: vi.fn<Client["send"]>(),
        raw: vi.fn<Client["raw"]>(),
        enqueueRaw: vi.fn<Client["enqueueRaw"]>(),
      }) as unknown as Client,
  );
  for (const [seat, client] of clients.entries()) {
    room.clients.push(client);
    room.onJoin(client, { displayName: `Player ${seat}`, deck: seat === 0 ? RED_DECK : BLUE_DECK });
  }
  Reflect.set(room, "scenarioFixture", structuredClone(board));
  Reflect.get(room, "startScenarioNow").call(room);
  await idle();
  const callback: unknown = messageSpy.mock.calls.find(([type]) => type === "*")![1];
  if (typeof callback !== "function") throw new Error("Missing intent message handler");
  return {
    room,
    clients,
    persist,
    receive: (client: Client, type: string, payload: unknown) => callback(client, type, payload),
  };
}
async function request(room: AegisRoom, client: Client, kind: RollbackKind) {
  await Reflect.get(room, "handleRollback").call(room, client, {
    type: "request",
    kind,
    revision: room.state.rollbackRevision,
  });
}
async function answer(room: AegisRoom, client: Client, accept: boolean, requestId = room.state.rollbackRequestId) {
  await Reflect.get(room, "handleRollback").call(room, client, {
    type: "respond",
    accept,
    requestId,
    revision: room.state.rollbackRevision,
  });
  await idle();
}
async function main(room: AegisRoom) {
  const result =
    room.state.phase === Phase.Breeding ? send(room, room.state.turnSeat, { type: "endPhase" }) : { ok: true };
  expect(result).toEqual({ ok: true });
  await idle();
  expect(room.state.phase).toBe(Phase.Main);
}
afterEach(() => {
  for (const room of rooms.splice(0)) {
    room.state.gameOver = true;
    engine(room).decisions.cancel();
    engine(room).mainPhase.abort();
    engine(room).breeding.abort();
    room.onDispose();
    room.clock.stop();
  }
});

describe("consensual match rollback", () => {
  it("restores hidden zones, bookkeeping and the last action only after the opponent accepts, then plays again", async () => {
    const { room, clients } = await start();
    await main(room);
    const before = room.state.players.map((player) => player.toJSON());
    const card = room.state.players[0]!.hand.find((entry) => entry.cardId === "BT1-009")!;
    expect(send(room, 0, { type: "playCard", instanceId: card.instanceId })).toEqual({ ok: true });
    await idle();
    expect(room.state.memory).toBe(8);
    const source = engine(room);
    await request(room, clients[0]!, RollbackKind.ACTION.value);
    expect(room.state.memory).toBe(8);
    await answer(room, clients[0]!, true);
    expect(engine(room)).toBe(source);
    await answer(room, clients[1]!, true);
    expect(engine(room)).not.toBe(source);
    expect(room.state.memory).toBe(10);
    expect(room.state.players.map((player) => player.toJSON())).toEqual(before);
    expect(room.state.rollbackRevision).toBe(1);
    expect(send(room, 0, { type: "playCard", instanceId: card.instanceId })).toEqual({ ok: true });
    await idle();
    expect(room.state.memory).toBe(8);
  });

  it.each([RollbackKind.ACTION.value, RollbackKind.TURN.value])(
    "rejects undoing the opponent's actions with %s",
    async (kind) => {
      const { room, clients } = await start();
      expect(send(room, 0, { type: "hatchEgg" })).toEqual({ ok: true });
      await idle();
      const before = room.state.toJSON();
      expect(room.state.undoActionSeat).toBe(0);
      expect(room.state.rollbackTurnSeat).toBe(0);
      await request(room, clients[1]!, kind);
      await answer(room, clients[0]!, true);
      expect(room.state.toJSON()).toEqual(before);
      await request(room, clients[0]!, kind);
      await answer(room, clients[1]!, true);
      expect(room.state.rollbackRevision).toBe(1);
      expect(room.state.players[0]!.breeding).toBeUndefined();
      expect(room.state.undoActionSeat).toBe(-1);
    },
  );

  it("does not skip an opponent action to undo an older own action", async () => {
    const { room, clients } = await start();
    await main(room);
    expect(send(room, 0, { type: "endPhase" })).toEqual({ ok: true });
    await idle();
    await main(room);
    expect(room.state.undoActionSeat).toBe(1);
    const before = room.state.toJSON();
    await request(room, clients[0]!, RollbackKind.ACTION.value);
    expect(room.state.toJSON()).toEqual(before);
    await request(room, clients[1]!, RollbackKind.ACTION.value);
    await answer(room, clients[0]!, true);
    expect(room.state.rollbackRevision).toBe(1);
    expect(room.state.turnSeat).toBe(1);
    expect(room.state.phase).toBe(Phase.Breeding);
    expect(room.state.undoActionSeat).toBe(0);
  });

  it("refuses without changing play and invalidates the old consent request", async () => {
    const { room, clients } = await start();
    expect(send(room, 0, { type: "hatchEgg" })).toEqual({ ok: true });
    await idle();
    await request(room, clients[0]!, RollbackKind.ACTION.value);
    const id = room.state.rollbackRequestId;
    await answer(room, clients[1]!, false);
    expect(room.state.rollbackRequestId).toBe("");
    expect(room.state.players[0]!.breeding).toBeDefined();
    await answer(room, clients[1]!, true, id);
    expect(room.state.rollbackRevision).toBe(0);
    expect(send(room, 0, { type: "endPhase" })).toEqual({ ok: true });
    await idle();
    expect(room.state.turnSeat).toBe(1);
  });

  it("rolls back the current turn and at its start rolls back the previous turn, including subsequent draws", async () => {
    const { room, clients } = await start();
    const initialDeck = room.state.players[1]!.deck.map((card) => card.instanceId);
    expect(send(room, 0, { type: "hatchEgg" })).toEqual({ ok: true });
    await idle();
    await request(room, clients[0]!, RollbackKind.TURN.value);
    await answer(room, clients[1]!, true);
    expect(room.state.turnCount).toBe(1);
    expect(room.state.phase).toBe(Phase.Breeding);
    expect(room.state.players[0]!.breeding).toBeUndefined();
    await main(room);
    expect(send(room, 0, { type: "endPhase" })).toEqual({ ok: true });
    await idle();
    expect(room.state.turnCount).toBe(2);
    expect(room.state.players[1]!.hand).toHaveLength(1);
    await request(room, clients[1]!, RollbackKind.TURN.value);
    expect(room.state.rollbackRequestId).toBe("");
    expect(room.state.rollbackTurnSeat).toBe(0);
    await request(room, clients[0]!, RollbackKind.TURN.value);
    await answer(room, clients[1]!, true);
    expect(room.state.turnCount).toBe(1);
    expect(room.state.players[1]!.deck.map((card) => card.instanceId)).toEqual(initialDeck);
    expect(room.state.players[1]!.hand).toHaveLength(0);
    await main(room);
    expect(send(room, 0, { type: "endPhase" })).toEqual({ ok: true });
    await idle();
    expect(room.state.players[1]!.hand[0]!.instanceId).toBe(initialDeck[0]);
  });

  it("restores an unanswered effect decision and its continuation after undoing an answer", async () => {
    const { room, clients } = await start();
    await main(room);
    const card = room.state.players[0]!.hand.find((entry) => entry.cardId === "BT1-010")!;
    expect(send(room, 0, { type: "playCard", instanceId: card.instanceId })).toEqual({ ok: true });
    await idle();
    const decision = room.state.pendingDecision!;
    expect(decision.kind).toBe("selectCards");
    const options = JSON.parse(decision.payloadJson) as { candidateInstanceIds: string[] };
    const response = {
      type: "respondDecision" as const,
      decisionId: decision.decisionId,
      response: { kind: "selectCards" as const, instanceIds: options.candidateInstanceIds.slice(0, 1) },
    };
    expect(send(room, 0, response)).toEqual({ ok: true });
    await idle();
    await request(room, clients[0]!, RollbackKind.ACTION.value);
    await answer(room, clients[1]!, true);
    expect(room.state.pendingDecision?.kind).toBe("selectCards");
    expect(room.state.pendingDecision?.payloadJson).toBe(decision.payloadJson);
    expect(send(room, 0, response)).toEqual({ ok: true });
    await idle();
    const pending = room.state.pendingDecision;
    expect(pending?.kind).toBe("orderCards");
    const order = JSON.parse(pending!.payloadJson).candidateInstanceIds as string[];
    expect(
      send(room, 0, {
        type: "respondDecision",
        decisionId: pending!.decisionId,
        response: { kind: "orderCards", order },
      }),
    ).toEqual({ ok: true });
    await idle();
    expect(room.state.players[0]!.hand.some((entry) => entry.cardId === "BT1-086")).toBe(true);
    expect(room.state.pendingDecision).toBeUndefined();
  });

  it("undoes an answer to a start-of-main-phase effect after a patch refreshed the hand", async () => {
    const board = structuredClone(fixture);
    board.board[1] = {
      hand: ["EX8-047", "BT1-009"],
      deck: ["BT1-009", "BT1-012", "BT1-013"],
      eggDeck: ["BT1-001"],
      security: ["BT1-019"],
      battleArea: [{ card: "EX11-065", as: "close" }],
    };
    const { room, clients } = await start({}, board);
    await main(room);
    expect(send(room, 0, { type: "endPhase" })).toEqual({ ok: true });
    await idle();
    await main(room);
    const decision = room.state.pendingDecision!;
    expect(decision).toMatchObject({ seat: 1, kind: "selectCards" });
    room.onBeforePatch();
    const options = JSON.parse(decision.payloadJson) as { candidateInstanceIds: string[] };
    expect(
      send(room, 1, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "selectCards", instanceIds: options.candidateInstanceIds.slice(0, 1) },
      }),
    ).toEqual({ ok: true });
    await idle();
    await request(room, clients[1]!, RollbackKind.ACTION.value);
    await answer(room, clients[0]!, true);
    expect(room.state.rollbackRevision).toBe(1);
    expect(room.state.pendingDecision?.decisionId).toBe(decision.decisionId);
  });

  it.each([{ allowRollback: false }, { allowRollback: undefined }, { rankedRoom: true }, { tournamentRoom: true }])(
    "enforces disabled and ineligible modes despite a forged request: %j",
    async (options) => {
      const { room, clients } = await start(options);
      await main(room);
      expect(room.state.allowRollback).toBe(false);
      await request(room, clients[0]!, RollbackKind.ACTION.value);
      expect(room.state.rollbackRequestId).toBe("");
      expect(room.state.rollbackRevision).toBe(0);
    },
  );

  it.each([{ betaBattleRoom: true }, { unlimitedRoom: true }, { private: true }])(
    "keeps rollback available in eligible casual variants and private rooms: %j",
    async (options) => {
      const { room, clients } = await start(options);
      await main(room);
      expect(room.state.allowRollback).toBe(true);
      await request(room, clients[0]!, RollbackKind.ACTION.value);
      await answer(room, clients[1]!, true);
      expect(room.state.rollbackRevision).toBe(1);
      expect(room.state.phase).toBe(Phase.Breeding);
    },
  );

  it("accepts immediately against a bot with a persona, discards scheduled work and resumes the restored phase", async () => {
    const { room, clients } = await start({ botRoom: true });
    const sent = vi.fn<(intent: Intent) => ReturnType<typeof send>>((intent: Intent) => send(room, 1, intent));
    const bot = new BotPlayer(1, room.state, sent, { minThinkMs: 0, maxThinkMs: 0 });
    Reflect.get(room, "bots")[1] = bot;
    room.state.players[1]!.botPersonaId = "rollback-persona";
    expect(send(room, 0, { type: "hatchEgg" })).toEqual({ ok: true });
    await idle();
    await request(room, clients[0]!, RollbackKind.ACTION.value);
    await idle();
    expect(room.state.rollbackRevision).toBe(1);
    expect(room.state.players[1]!.botPersonaId).toBe("rollback-persona");
    expect(room.state.rollbackRequestId).toBe("");
    expect(room.state.players[0]!.breeding).toBeUndefined();
    expect(Reflect.get(room, "bots")[1]).not.toBe(bot);
    expect(Reflect.get(bot, "disposed")).toBe(true);
  });

  it("rejects stale client actions and invalidated consent after a rollback", async () => {
    const { room, clients, receive } = await start();
    send(room, 0, { type: "hatchEgg" });
    await idle();
    await request(room, clients[0]!, RollbackKind.ACTION.value);
    const previousRequest = room.state.rollbackRequestId;
    await answer(room, clients[1]!, true);
    receive(clients[0]!, "hatchEgg", { rollbackRevision: 0 });
    await idle();
    expect(room.state.players[0]!.breeding).toBeUndefined();
    receive(clients[0]!, "hatchEgg", { rollbackRevision: 1 });
    await idle();
    expect(room.state.players[0]!.breeding).toBeDefined();
    await answer(room, clients[1]!, true, previousRequest);
    expect(room.state.rollbackRevision).toBe(1);
  });

  it("gives reconstructed views complete own-hand and public-card identities while keeping opposing hidden zones private", async () => {
    const { room, clients } = await start();
    send(room, 0, { type: "hatchEgg" });
    await idle();
    await request(room, clients[0]!, RollbackKind.ACTION.value);
    await answer(room, clients[1]!, true);
    const encoder = Reflect.get(room, "_serializer").encoder as Encoder<GameState>;
    const iterator = { offset: 0 };
    encoder.encodeAll(iterator);
    const owner = new Decoder(new GameState());
    const opponent = new Decoder(new GameState());
    owner.decode(encoder.encodeAllView(clients[0]!.view!, iterator.offset, { offset: iterator.offset }));
    opponent.decode(encoder.encodeAllView(clients[1]!.view!, iterator.offset, { offset: iterator.offset }));
    expect(owner.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT1-009", "BT1-010"]);
    expect(opponent.state.players[0]!.hand).toHaveLength(0);
    expect(owner.state.players[0]!.battleArea[0]!.topCard.cardId).toBe("BT1-019");
    expect(opponent.state.players[0]!.battleArea[0]!.topCard.cardId).toBe("BT1-019");
    expect(owner.state.players[0]!.deck).toHaveLength(0);
    expect(opponent.state.players[0]!.security).toHaveLength(0);
  });

  it("keeps card moves of the replaced engine out of the restored views", async () => {
    const { room, clients } = await start();
    send(room, 0, { type: "hatchEgg" });
    await idle();
    const replaced = room.state;
    const permanent = replaced.players[0]!.breeding!;
    const card = replaced.players[0]!.hand[0]!;
    await request(room, clients[0]!, RollbackKind.ACTION.value);
    await answer(room, clients[1]!, true);
    expect(room.state).not.toBe(replaced);
    pushOnStack(permanent, card);
    expect(() => room.broadcastPatch()).not.toThrow();
  });

  it("keeps an exact playable replay after repeated action and turn rollbacks", async () => {
    const lines: string[] = [];
    const stop = addLogSink((line) => lines.push(line));
    try {
      const { room, clients } = await start();
      send(room, 0, { type: "hatchEgg" });
      await idle();
      await request(room, clients[0]!, RollbackKind.ACTION.value);
      await answer(room, clients[1]!, true);
      send(room, 0, { type: "hatchEgg" });
      await idle();
      await request(room, clients[0]!, RollbackKind.TURN.value);
      await answer(room, clients[1]!, true);
      await main(room);
      const card = room.state.players[0]!.hand[0]!;
      send(room, 0, { type: "playCard", instanceId: card.instanceId });
      await idle();
      const record = extractReplay(lines, room.state.matchLogId);
      const replay = await runReplay(record, { stopOnDivergence: true });
      try {
        expect(replay.divergences).toEqual([]);
        engine(room).flushHandAffordances();
        replay.engine.flushHandAffordances();
        const actual = comparableState(room.state) as Record<string, unknown>;
        const expected = comparableState(replay.state) as Record<string, unknown>;
        for (const key of [
          "rollbackRevision",
          "allowRollback",
          "canUndoAction",
          "canRollbackTurn",
          "undoActionSeat",
          "rollbackTurnSeat",
          "stateVersion",
        ]) {
          delete actual[key];
          delete expected[key];
        }
        expect(actual).toEqual(expected);
        expect(await replay.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
        expect(send(room, 0, { type: "endPhase" })).toEqual({ ok: true });
        await idle();
        expect(replay.state.players[1]!.hand.map((entry) => entry.instanceId)).toEqual(
          room.state.players[1]!.hand.map((entry) => entry.instanceId),
        );
      } finally {
        replay.state.gameOver = true;
        replay.engine.mainPhase.abort();
        replay.engine.breeding.abort();
      }
    } finally {
      stop();
    }
  });

  it("safely refuses a divergent reconstruction without replacing the live engine", async () => {
    const { room, clients } = await start();
    send(room, 0, { type: "hatchEgg" });
    await idle();
    const source = engine(room);
    const history = Reflect.get(room, "rollbackHistory");
    history.inputs[0].stateVersion = 99;
    await request(room, clients[0]!, RollbackKind.ACTION.value);
    await answer(room, clients[1]!, true);
    expect(engine(room)).toBe(source);
    expect(room.state.players[0]!.breeding).toBeDefined();
    expect(room.state.rollbackRevision).toBe(0);
    expect(room.state.rollbackBusy).toBe(false);
  });

  it("recreates consumed shuffle randomness and a pending security selection before subsequent play", async () => {
    const board = structuredClone(fixture);
    board.board[0]!.hand = ["BT1-087", "BT1-009"];
    board.board[0]!.security = ["BT1-009", "BT1-012", "BT1-013", "BT1-014", "BT1-015"];
    const { room, clients } = await start({}, board);
    await main(room);
    const tamer = room.state.players[0]!.hand[0]!;
    expect(send(room, 0, { type: "playCard", instanceId: tamer.instanceId })).toEqual({ ok: true });
    await idle();
    const decision = room.state.pendingDecision!;
    const choices = JSON.parse(decision.payloadJson).candidateInstanceIds as string[];
    const response: Intent = {
      type: "respondDecision",
      decisionId: decision.decisionId,
      response: { kind: "selectCards", instanceIds: [choices[0]!] },
    };
    expect(send(room, 0, response)).toEqual({ ok: true });
    await idle();
    const shuffled = room.state.players[0]!.security.map((card) => card.instanceId);
    await request(room, clients[0]!, RollbackKind.ACTION.value);
    await answer(room, clients[1]!, true);
    expect(room.state.pendingDecision?.kind).toBe("selectCards");
    expect(send(room, 0, response)).toEqual({ ok: true });
    await idle();
    expect(room.state.players[0]!.security.map((card) => card.instanceId)).toEqual(shuffled);
    expect(
      send(room, 0, {
        type: "playCard",
        instanceId: room.state.players[0]!.hand.find((card) => card.cardId === "BT1-009")!.instanceId,
      }),
    ).toEqual({ ok: true });
    await idle();
    expect(room.state.players[0]!.battleArea).toHaveLength(3);
  });

  it("drops a bot move already waiting on its scheduler and schedules a new move when play resumes", async () => {
    const { room, clients } = await start({ botRoom: true });
    await main(room);
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sent = vi.fn<(intent: Intent) => ReturnType<typeof send>>((intent) => send(room, 1, intent));
    const policy = createEvaluationPolicy({ seed: 12 });
    const bot = new BotPlayer(1, room.state, sent, {
      thinkDelay: () => waiting,
      policy: {
        ...policy,
        chooseBreedingAction: () => ({ type: "endPhase" }),
        chooseMainAction: () => ({ type: "endPhase" }),
      },
    });
    Reflect.get(room, "bots")[1] = bot;
    expect(send(room, 0, { type: "endPhase" })).toEqual({ ok: true });
    await idle();
    expect(room.state.turnSeat).toBe(1);
    await request(room, clients[0]!, RollbackKind.ACTION.value);
    await idle();
    expect(room.state.turnSeat).toBe(0);
    expect(room.state.phase).toBe(Phase.Main);
    release();
    await idle();
    expect(sent).not.toHaveBeenCalled();
    expect(send(room, 0, { type: "endPhase" })).toEqual({ ok: true });
    await idle();
    expect(sent).toHaveBeenCalledWith({ type: "endPhase" });
    expect(room.state.turnSeat).toBe(0);
    expect(room.state.turnCount).toBe(3);
  });

  it("keeps a finished game final before persistence can be repeated", async () => {
    const { room, clients, persist } = await start();
    const accounts = Reflect.get(room, "accountByClient") as Map<string, string>;
    accounts.set(clients[0]!.sessionId, "owner-zero");
    accounts.set(clients[1]!.sessionId, "owner-one");
    await main(room);
    expect(send(room, 0, { type: "surrender" })).toEqual({ ok: true });
    await idle();
    expect(persist).toHaveBeenCalledTimes(2);
    await request(room, clients[0]!, RollbackKind.TURN.value);
    expect(room.state.gameOver).toBe(true);
    expect(room.state.rollbackRevision).toBe(0);
    expect(room.state.rollbackRequestId).toBe("");
    expect(send(room, 0, { type: "surrender" }).ok).toBe(false);
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it("undoes a source selection after a digivolution decision refreshed hand affordances", async () => {
    const { room, clients } = await start({ betaBattleRoom: true }, decisionRollbackFixture);
    await main(room);
    const card = room.state.players[0]!.hand.find((entry) => entry.cardId === "BT18-042")!;
    const host = room.state.players[0]!.battleArea[0]!;
    expect(send(room, 0, { type: "digivolve", instanceId: card.instanceId, permanentId: host.permanentId })).toEqual({
      ok: true,
    });
    await idle();
    let decision = room.state.pendingDecision!;
    expect(decision.kind).toBe("optional");
    expect(
      send(room, 0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await idle();
    decision = room.state.pendingDecision!;
    expect(decision.kind).toBe("selectCards");
    const options = JSON.parse(decision.payloadJson) as { candidateInstanceIds: string[] };
    expect(
      send(room, 0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "selectCards", instanceIds: options.candidateInstanceIds.slice(0, 1) },
      }),
    ).toEqual({ ok: true });
    await idle();
    await request(room, clients[0]!, RollbackKind.ACTION.value);
    await answer(room, clients[1]!, true);
    expect(room.state.rollbackRevision).toBe(1);
    expect(room.state.pendingDecision?.decisionId).toBe(decision.decisionId);
    expect(room.state.pendingDecision?.payloadJson).toBe(decision.payloadJson);
    expect(room.state.players[0]!.security).toHaveLength(2);
    expect(
      send(room, 0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "selectCards", instanceIds: options.candidateInstanceIds.slice(0, 1) },
      }),
    ).toEqual({ ok: true });
    await idle();
    expect(room.state.players[0]!.security).toHaveLength(3);
    expect(room.state.pendingDecision).toBeUndefined();
  });

  it("undoes accepting a play cost reduction whose prompt opened over current hand affordances", async () => {
    const { room, clients } = await start({ betaBattleRoom: true }, playCostReductionRollbackFixture);
    await main(room);
    const card = room.state.players[0]!.hand.find((entry) => entry.cardId === "BT13-080")!;
    expect(send(room, 0, { type: "playCard", instanceId: card.instanceId })).toEqual({ ok: true });
    await idle();
    const decision = room.state.pendingDecision!;
    expect(decision.kind).toBe("optional");
    expect(
      send(room, 0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await idle();
    expect(room.state.pendingDecision?.kind).toBe("selectCards");
    await request(room, clients[0]!, RollbackKind.ACTION.value);
    await answer(room, clients[1]!, true);
    expect(room.state.rollbackRevision).toBe(1);
    expect(room.state.pendingDecision?.decisionId).toBe(decision.decisionId);
  });
});
