import { afterEach, describe, expect, it, vi } from "vitest";
import type { Client } from "colyseus";
import { AegisRoom } from "#api/rooms/AegisRoom";
import { GameMode } from "@aegis/shared/manual/GameMode";
import { tokenDefinitions } from "@aegis/shared/cards/tokens";
import { ManualCombatStage } from "@aegis/shared/manual/ManualCombatStage";
import { Zone, Phase, CardColor } from "@aegis/shared/schema/enums";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import type { Intent } from "@aegis/shared/protocol/intents";
import { RED_DECK, BLUE_DECK } from "#api/engine/testDecks";
import { addLogSink } from "#api/logger";
import { extractReplay } from "#api/replays/inputs/extract";
import { runReplay } from "#api/replays/inputs/run";

const rooms: AegisRoom[] = [];

afterEach(() => {
  for (const room of rooms.splice(0)) {
    room.onDispose();
    room.clock.clear();
  }
});

function createRoom(manualRoom: boolean) {
  const room = new AegisRoom();
  room.lock = vi.fn<AegisRoom["lock"]>(async () => {});
  room.unlock = vi.fn<AegisRoom["unlock"]>(async () => {});
  room.setMatchmaking = vi.fn<AegisRoom["setMatchmaking"]>(async () => {});
  room.broadcast = vi.fn<AegisRoom["broadcast"]>(() => true);
  room.onCreate({
    seed: 0,
    manualRoom,
    betaBattleRoom: manualRoom,
    allowFormatSelection: true,
    allowUnlimitedSelection: true,
    matchTimer: true,
    bestOf: 3,
    allowRollback: true,
  });
  rooms.push(room);
  const clients = ["first", "second"].map(
    (sessionId) => ({ sessionId, send: vi.fn<Client["send"]>(), view: undefined }) as unknown as Client,
  );
  const handleIntent = Reflect.get(room, "handleIntent").bind(room) as (client: Client, intent: Intent) => void;
  const send = (seat: number, intent: Intent) => handleIntent(clients[seat]!, intent);
  const join = () => {
    for (const [seat, client] of clients.entries()) {
      room.clients.push(client);
      room.onJoin(client, {
        displayName: client.sessionId,
        deck: seat === 0 ? RED_DECK : BLUE_DECK,
        gameMode: manualRoom ? GameMode.MANUAL.value : GameMode.AUTOMATIC.value,
      });
    }
  };
  return { room, clients, send, join };
}

describe("manual room boundaries and replay", () => {
  it("rejects bots and series in manual rooms", () => {
    const { room, clients } = createRoom(true);
    room.clients.push(clients[0]!);
    expect(room.addBot()).toBe(false);
    expect(Reflect.get(room, "offersSeries").call(room)).toBe(false);
    room.state.gameOver = true;
    expect(Reflect.get(room, "startRematchSeries").call(room, 0)).toBe(false);
  });

  it("keeps automatic room execution unchanged when a client sends a manual command", () => {
    const { room, join, send } = createRoom(false);
    join();
    expect(room.state.gameMode).toBe(GameMode.AUTOMATIC.value);
    send(0, { type: "manual", requestId: "forged", revision: 0, command: { action: "memory", value: 10 } });
    expect(room.state.memory).toBe(0);
    expect(room.state.manual.revision).toBe(0);
  });

  it("records and deterministically replays manual preparation, shuffles, undo and results", async () => {
    const lines: string[] = [];
    const stopCapture = addLogSink((line) => lines.push(line));
    try {
      const { room, join, send } = createRoom(true);
      join();
      expect(room.state.matchTimer).toBe(false);
      expect(room.state.allowRollback).toBe(false);
      expect(room.state.series.bestOf).toBe(1);
      send(0, { type: "ready" });
      send(1, { type: "ready" });
      const first = room.state.pendingDecision!;
      expect(first.kind).toBe("chooseOption");
      send(first.seat, {
        type: "respondDecision",
        decisionId: first.decisionId,
        response: { kind: "chooseOption", optionIndex: 0 },
      });
      await vi.waitFor(() => expect(room.state.pendingDecision?.kind).toBe("mulligan"));
      send(room.state.pendingDecision!.seat, { type: "mulligan", keep: true });
      await vi.waitFor(() => expect(room.state.pendingDecision?.kind).toBe("mulligan"));
      send(room.state.pendingDecision!.seat, { type: "mulligan", keep: false });
      await vi.waitFor(() => expect(room.state.turnCount).toBe(1));
      let sequence = 0;
      const manual = (seat: number, command: Extract<Intent, { type: "manual" }>["command"]) =>
        send(seat, {
          type: "manual",
          requestId: `manual-${++sequence}`,
          revision: room.state.manual.revision,
          command,
        });
      expect(room.state.manual.turnPhase).toBe(Phase.Breeding);
      expect(room.state.players[room.state.turnSeat]!.hand).toHaveLength(5);
      manual(room.state.turnSeat, { action: "breeding", choice: "skip" });
      manual(0, { action: "draw", count: 2 });
      manual(1, { action: "inspect", zone: Zone.Security, count: 5 });
      manual(0, { action: "shuffle", zone: Zone.Deck });
      manual(0, { action: "requestUndo" });
      manual(1, { action: "answerUndo", accept: true });
      manual(0, { action: "createToken", cardId: tokenDefinitions[0]!.cardId });
      const token = room.state.players[0]!.battleArea[0]!;
      manual(0, {
        action: "modifiers",
        permanentId: token.permanentId,
        securityAttackModifier: 2,
        keywords: ["Rush"],
        colors: [CardColor.Red],
      });
      manual(0, { action: "requestUndo" });
      manual(1, { action: "answerUndo", accept: true });
      expect(room.state.players[0]!.battleArea[0]!.securityAttackModifier).toBe(0);
      expect(room.state.players[0]!.battleArea[0]!.keywords).toHaveLength(0);
      manual(0, { action: "reveal", from: { zone: Zone.Deck }, count: 3 });
      manual(1, { action: "reveal", from: { zone: Zone.Hand }, count: 2 });
      manual(0, { action: "clearReveals" });
      manual(0, { action: "flip", from: { zone: Zone.Security }, faceUp: true });

      manual(0, { action: "attack", permanentId: token.permanentId });
      manual(0, { action: "combat", stage: ManualCombatStage.COUNTER.value });
      manual(1, { action: "combat", stage: ManualCombatStage.BLOCK.value });
      manual(1, { action: "combat", stage: ManualCombatStage.RESOLUTION.value });
      manual(0, { action: "combat", stage: ManualCombatStage.SECURITY.value });
      manual(0, { action: "combat", stage: ManualCombatStage.NONE.value });
      manual(0, { action: "removeToken", permanentId: token.permanentId });
      manual(0, { action: "createToken", cardId: tokenDefinitions[0]!.cardId });
      const trained = room.state.players[0]!.battleArea[0]!;
      manual(0, { action: "statuses", permanentId: trained.permanentId, statuses: ["sick", "taunt", "immune"] });
      manual(0, { action: "training", permanentId: trained.permanentId });
      manual(0, {
        action: "signal",
        from: { zone: Zone.Hand, instanceId: room.state.players[0]!.hand[0]!.instanceId },
        targetSeat: 1,
      });
      manual(0, { action: "resetModifiers", permanentId: trained.permanentId });
      const oldFirstCardId = room.state.players[0]!.hand[0]!.instanceId;
      const oldRevision = room.state.manual.revision;
      manual(0, { action: "proposeRestart", firstSeat: 1 });
      manual(0, { action: "answerRestart", accept: true });
      expect(room.state.manual.restartRequester).toBe(0);
      manual(1, { action: "answerRestart", accept: true });
      expect(room.state.manual.restartCount).toBe(1);
      expect(room.state.manual.revision).toBe(oldRevision + 2);
      expect(room.state.turnCount).toBe(0);
      expect(room.state.players[0]!.battleArea).toHaveLength(0);
      expect(room.state.manual.signalCardId).toBe("");
      expect(room.state.manual.revealedJson).toBe("[]");
      expect(room.state.pendingDecision?.seat).toBe(1);
      send(1, { type: "mulligan", keep: true });
      await vi.waitFor(() => expect(room.state.pendingDecision?.seat).toBe(0));
      send(0, { type: "mulligan", keep: false });
      await vi.waitFor(() => expect(room.state.turnCount).toBe(1));
      expect(room.state.turnSeat).toBe(1);
      expect(room.state.manual.turnPhase).toBe(Phase.Breeding);
      expect(room.state.players[1]!.hand).toHaveLength(5);
      manual(1, { action: "breeding", choice: "skip" });
      const nextHand = room.state.players[0]!.hand.length;
      manual(1, { action: "pass" });
      expect(room.state.players[0]!.hand).toHaveLength(nextHand + 1);
      expect(room.state.manual.turnPhase).toBe(Phase.Breeding);
      manual(1, { action: "requestUndo" });
      manual(0, { action: "answerUndo", accept: true });
      expect(room.state.turnSeat).toBe(1);
      expect(room.state.players[0]!.hand).toHaveLength(nextHand);
      expect(room.state.manual.turnPhase).toBe(Phase.Main);
      manual(1, { action: "pass" });
      expect(room.state.players[0]!.hand).toHaveLength(nextHand + 1);
      manual(0, { action: "breeding", choice: "hatch" });
      expect(room.state.players[0]!.breeding).toBeDefined();
      expect(room.state.manual.turnPhase).toBe(Phase.Main);
      expect(room.state.players[0]!.hand[0]!.instanceId).not.toBe(oldFirstCardId);
      expect(room.state.players[0]!.security).toHaveLength(5);
      expect(room.state.players[1]!.security).toHaveLength(5);

      manual(1, { action: "proposeResult", winnerSeat: -1 });
      manual(0, { action: "answerResult", accept: true });
      expect(room.state.gameOver).toBe(true);
      const record = extractReplay(lines, room.state.matchLogId);
      expect(record.rules.gameMode).toBe(GameMode.MANUAL.value);
      expect(record.inputs.some((input) => input.kind === "intent" && input.intent.type === "manual")).toBe(true);
      const replay = await runReplay(record);
      expect(replay.divergences).toEqual([]);
      expect(replay.state.players[0]!.deck.map((card) => card.instanceId)).toEqual(
        room.state.players[0]!.deck.map((card) => card.instanceId),
      );
      expect(replay.state.manual.toJSON()).toEqual(room.state.manual.toJSON());
      expect(replay.state.winnerSeat).toBe(-1);
    } finally {
      stopCapture();
    }
  });
});

it("finishes and deterministically replays a scheduled draw loss through the real manual room", async () => {
  const lines: string[] = [];
  const stopCapture = addLogSink((line) => lines.push(line));
  try {
    const { room, join, send } = createRoom(true);
    join();
    send(0, { type: "ready" });
    send(1, { type: "ready" });
    const choice = room.state.pendingDecision!;
    send(choice.seat, {
      type: "respondDecision",
      decisionId: choice.decisionId,
      response: { kind: "chooseOption", optionIndex: 0 },
    });
    await vi.waitFor(() => expect(room.state.pendingDecision?.kind).toBe("mulligan"));
    send(room.state.pendingDecision!.seat, { type: "mulligan", keep: true });
    await vi.waitFor(() => expect(room.state.pendingDecision?.kind).toBe("mulligan"));
    send(room.state.pendingDecision!.seat, { type: "mulligan", keep: true });
    await vi.waitFor(() => expect(room.state.turnCount).toBe(1));
    let sequence = 0;
    const manual = (seat: number, command: Extract<Intent, { type: "manual" }>["command"]) =>
      send(seat, {
        type: "manual",
        requestId: `scheduled-${++sequence}`,
        revision: room.state.manual.revision,
        command,
      });
    const first = room.state.turnSeat;
    const second = (1 - first) as 0 | 1;
    manual(first, { action: "breeding", choice: "skip" });
    manual(second, { action: "draw", count: room.state.players[second]!.deck.length });
    expect(room.state.gameOver).toBe(false);
    manual(first, { action: "pass" });
    expect(room.state.gameOver).toBe(true);
    expect(room.state.players[second]!.lost).toBe(true);
    expect(room.state.winnerSeat).toBe(first);
    expect(room.state.manual.canUndo).toBe(false);
    const record = extractReplay(lines, room.state.matchLogId);
    const replay = await runReplay(record);
    expect(replay.divergences).toEqual([]);
    expect(replay.state.winnerSeat).toBe(first);
    expect(replay.state.manual.toJSON()).toEqual(room.state.manual.toJSON());
  } finally {
    stopCapture();
  }
});

it("announces only the selected first player after the chooser selects the other seat", async () => {
  const lines: string[] = [];
  const stopCapture = addLogSink((line) => lines.push(line));
  try {
    const { room, join, send } = createRoom(true);
    const getStarts = () =>
      vi
        .mocked(room.broadcast)
        .mock.calls.map((call) => call[1] as ServerEvent)
        .filter((event) => event.kind === "matchStarted");
    join();
    send(0, { type: "ready" });
    send(1, { type: "ready" });
    const choice = room.state.pendingDecision!;
    expect(choice.kind).toBe("chooseOption");
    expect(getStarts()).toEqual([]);
    const firstSeat = (1 - choice.seat) as 0 | 1;
    send(choice.seat, {
      type: "respondDecision",
      decisionId: choice.decisionId,
      response: { kind: "chooseOption", optionIndex: 1 },
    });
    await vi.waitFor(() => expect(room.state.pendingDecision?.kind).toBe("mulligan"));
    expect(room.state.pendingDecision!.seat).toBe(firstSeat);
    expect(room.state.turnSeat).toBe(firstSeat);
    expect(getStarts()).toHaveLength(1);
    expect(getStarts()[0]).toMatchObject({ kind: "matchStarted", firstSeat });
    send(firstSeat, { type: "mulligan", keep: true });
    await vi.waitFor(() => expect(room.state.pendingDecision?.seat).toBe(1 - firstSeat));
    send((1 - firstSeat) as 0 | 1, { type: "mulligan", keep: true });
    await vi.waitFor(() => expect(room.state.turnCount).toBe(1));
    send(0, {
      type: "manual",
      requestId: "first-seat-result",
      revision: room.state.manual.revision,
      command: { action: "proposeResult", winnerSeat: -1 },
    });
    send(1, {
      type: "manual",
      requestId: "first-seat-accept",
      revision: room.state.manual.revision,
      command: { action: "answerResult", accept: true },
    });
    const record = extractReplay(lines, room.state.matchLogId);
    const replay = await runReplay(record);
    expect(replay.divergences).toEqual([]);
    expect(replay.state.turnSeat).toBe(firstSeat);
    expect(replay.state.manual.toJSON()).toEqual(room.state.manual.toJSON());
  } finally {
    stopCapture();
  }
});
