import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "colyseus";
import { ALL_FAMOUS_DECKS, type Intent } from "@aegis/shared";
import { AegisRoom } from "./AegisRoom.js";
import { botPersonaForDeck } from "@aegis/shared/bot/personas/botPersonaForDeck";
import { RED_DECK } from "../engine/testDecks.js";
import { InferenceClient } from "../bot/training/inferenceClient.js";
import { trainingDeck, TRAINING_DECK_VERSIONS } from "../bot/training/decks.js";
import { startBotInference, stopBotInference, trainedBotOptions } from "../bot/inferenceRuntime.js";
import type { TrainingWindow } from "../bot/training/policy.js";
import type { GameEngine } from "../engine/GameEngine.js";
import type { BotPlayer } from "../bot/BotPlayer.js";

// Runtime hashing is verified by the real desktop worker; this suite exercises the live room boundary.
vi.mock("../bot/training/metadata.js", () => ({ trainingMetadata: () => ({ engineSha256: "room-test" }) }));

const rooms: AegisRoom[] = [];
const choose = vi.fn<(window: TrainingWindow, signal: AbortSignal) => Promise<number>>();
const close = vi.fn<() => Promise<void>>();
const checkpoint = "/test/checkpoint.pt";

function roomWithHuman(deck = trainingDeck(TRAINING_DECK_VERSIONS[0]).deck) {
  const room = new AegisRoom();
  room.broadcast = vi.fn<() => boolean>(() => true) as AegisRoom["broadcast"];
  room.onCreate({ botRoom: true, seed: 2 });
  rooms.push(room);
  const human = { sessionId: "human", send: vi.fn<() => void>() } as unknown as Client;
  room.clients.push(human);
  room.onJoin(human, { displayName: "Human", deck });
  return { room, human };
}

function requestedDeck(index: 0 | 1) {
  return ALL_FAMOUS_DECKS.find((deck) => deck.deckVersion === TRAINING_DECK_VERSIONS[index])!.deckId;
}

async function keepAndAdvance(room: AegisRoom, human: Client) {
  const internal = room as unknown as { handleIntent: (client: Client, intent: Intent) => void };
  internal.handleIntent(human, { type: "mulligan", keep: true });
  await vi.advanceTimersByTimeAsync(6_000);
}

describe("opt-in trained policies in Aegis rooms", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    choose.mockReset().mockResolvedValue(0);
    close.mockReset().mockResolvedValue();
    vi.spyOn(InferenceClient, "start").mockResolvedValue({ choose, close } as unknown as InferenceClient);
  });

  afterEach(async () => {
    for (const room of rooms.splice(0)) {
      room.onDispose();
      room.clock.stop();
    }
    await stopBotInference();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("keeps inference disabled unless the server configures a checkpoint", async () => {
    await startBotInference({});
    const { room } = roomWithHuman();
    expect(room.addBot(requestedDeck(1))).toBe(true);
    expect(room.state.players[1]!.displayName).toBe(botPersonaForDeck({ deckId: requestedDeck(1) }).displayName);
    expect(room.state.players[1]!.botPersonaId).toBe(botPersonaForDeck({ deckId: requestedDeck(1) }).id);
    expect(InferenceClient.start).not.toHaveBeenCalled();
    const bot = (room as unknown as { bots: BotPlayer[] }).bots[1]!;
    expect(bot.policyName).toMatch(/^level:standard:[a-z]+:evaluation:/);
  });

  it.each([0, 1] as const)("uses the real async adapter for supported bot deck %i", async (deckIndex) => {
    await startBotInference({ AEGIS_BOT_CHECKPOINT: checkpoint, AEGIS_BOT_PYTHON: "/test/python" });
    const deck = trainingDeck(TRAINING_DECK_VERSIONS[0]).deck;
    deck.mainDeck.reverse();
    const { room, human } = roomWithHuman(deck);
    expect(room.addBot(requestedDeck(deckIndex))).toBe(true);
    expect(room.state.players[1]!.displayName).toBe(
      botPersonaForDeck({ deckId: requestedDeck(deckIndex) }).displayName,
    );
    expect(room.state.players[1]!.botPersonaId).toBe(botPersonaForDeck({ deckId: requestedDeck(deckIndex) }).id);
    expect(room.addBot(requestedDeck(deckIndex))).toBe(true);
    await keepAndAdvance(room, human);
    expect(choose).toHaveBeenCalled();
    expect(choose.mock.calls.every(([window]) => window.observation.seat === 1 && window.teacher === undefined)).toBe(
      true,
    );
    expect(InferenceClient.start).toHaveBeenCalledTimes(1);
    expect(InferenceClient.start).toHaveBeenCalledWith(expect.objectContaining({ command: "/test/python" }));
    expect(close).not.toHaveBeenCalled();
  });

  it("keeps unsupported opponent lists on the existing bot", async () => {
    await startBotInference({ AEGIS_BOT_CHECKPOINT: checkpoint });
    const { room, human } = roomWithHuman(RED_DECK);
    expect(room.addBot(requestedDeck(1))).toBe(true);
    expect(room.state.players[1]!.displayName).toBe(botPersonaForDeck({ deckId: requestedDeck(1) }).displayName);
    expect(room.state.players[1]!.botPersonaId).toBe(botPersonaForDeck({ deckId: requestedDeck(1) }).id);
    await keepAndAdvance(room, human);
    expect(choose).not.toHaveBeenCalled();
  });

  it("does not treat changed card counts as a supported list", async () => {
    await startBotInference({ AEGIS_BOT_CHECKPOINT: checkpoint });
    const { room } = roomWithHuman();
    const engine = (room as unknown as { engine: GameEngine }).engine;
    const changed = trainingDeck(TRAINING_DECK_VERSIONS[0]).deck;
    changed.mainDeck.pop();
    expect(
      trainedBotOptions({ engine, seat: 1, decks: [changed, trainingDeck(TRAINING_DECK_VERSIONS[1]).deck] }),
    ).toBeUndefined();
  });

  it("falls back when scoring fails without preventing match setup", async () => {
    await startBotInference({ AEGIS_BOT_CHECKPOINT: checkpoint });
    choose.mockRejectedValue(new Error("scorer unavailable"));
    const { room, human } = roomWithHuman();
    room.addBot(requestedDeck(1));
    await keepAndAdvance(room, human);
    const bot = (room as unknown as { bots: BotPlayer[] }).bots[1]!;
    expect(bot.inferenceFallbacks.error).toBeGreaterThan(0);
    expect(room.state.players[1]!.hasMulliganed).toBe(true);
  });

  it("disables a rejected model policy for the match without throwing from the engine callback", async () => {
    await startBotInference({ AEGIS_BOT_CHECKPOINT: checkpoint });
    const { room } = roomWithHuman();
    const engine = (room as unknown as { engine: GameEngine }).engine;
    const options = trainedBotOptions({
      engine,
      seat: 1,
      decks: [trainingDeck(TRAINING_DECK_VERSIONS[0]).deck, trainingDeck(TRAINING_DECK_VERSIONS[1]).deck],
    })!;
    expect(() => options.policy!.noteRejected({ type: "endPhase" })).not.toThrow();
    await expect(
      options.policy!.answerDecision(undefined, {
        kind: "mulligan",
        seat: 1,
        decisionId: "rejected-policy",
        promptText: "Keep hand?",
      }),
    ).rejects.toThrow("using fallback");
    expect(choose).not.toHaveBeenCalled();
  });

  it("cancels a disposed room's in-flight choice without closing the shared scorer", async () => {
    await startBotInference({ AEGIS_BOT_CHECKPOINT: checkpoint });
    choose.mockImplementation(() => new Promise(() => {}));
    const { room, human } = roomWithHuman();
    room.addBot(requestedDeck(1));
    const internal = room as unknown as { handleIntent: (client: Client, intent: Intent) => void };
    internal.handleIntent(human, { type: "mulligan", keep: true });
    for (let tick = 0; tick < 30 && choose.mock.calls.length === 0; tick++) await vi.advanceTimersByTimeAsync(100);
    expect(choose).toHaveBeenCalled();
    const signal = choose.mock.calls[0]![1];
    expect(signal.aborted).toBe(false);
    room.onDispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(signal.aborted).toBe(true);
    expect(close).not.toHaveBeenCalled();
    await stopBotInference();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("switches to fallback after an asynchronous engine rejection event", async () => {
    await startBotInference({ AEGIS_BOT_CHECKPOINT: checkpoint });
    const { room, human } = roomWithHuman();
    room.addBot(requestedDeck(1));
    const engine = (room as unknown as { engine: GameEngine }).engine;
    engine.hooks.emit({ kind: "actionRejected", intent: "playCard", reason: "asynchronous apply failure" });
    await keepAndAdvance(room, human);
    const bot = (room as unknown as { bots: BotPlayer[] }).bots[1]!;
    expect(bot.inferenceFallbacks.error).toBeGreaterThan(0);
    expect(choose).not.toHaveBeenCalled();
    expect(room.state.players[1]!.hasMulliganed).toBe(true);
  });

  it("waits for startup before closing the worker during shutdown", async () => {
    let loaded!: (client: InferenceClient) => void;
    vi.mocked(InferenceClient.start).mockReturnValueOnce(
      new Promise((resolve) => {
        loaded = resolve;
      }),
    );
    const starting = startBotInference({ AEGIS_BOT_CHECKPOINT: checkpoint });
    const stopping = stopBotInference();
    expect(close).not.toHaveBeenCalled();
    loaded({ choose, close } as unknown as InferenceClient);
    await Promise.all([starting, stopping]);
    expect(close).toHaveBeenCalledTimes(1);
    const { room } = roomWithHuman();
    room.addBot(requestedDeck(1));
    expect(room.state.players[1]!.displayName).toBe(botPersonaForDeck({ deckId: requestedDeck(1) }).displayName);
    expect(room.state.players[1]!.botPersonaId).toBe(botPersonaForDeck({ deckId: requestedDeck(1) }).id);
  });

  it("propagates startup incompatibility instead of claiming a loaded checkpoint", async () => {
    vi.mocked(InferenceClient.start).mockRejectedValueOnce(new Error("checkpoint/runtime mismatch"));
    await expect(startBotInference({ AEGIS_BOT_CHECKPOINT: checkpoint })).rejects.toThrow(
      "checkpoint/runtime mismatch",
    );
    const { room } = roomWithHuman();
    room.addBot(requestedDeck(1));
    expect(room.state.players[1]!.displayName).toBe(botPersonaForDeck({ deckId: requestedDeck(1) }).displayName);
    expect(room.state.players[1]!.botPersonaId).toBe(botPersonaForDeck({ deckId: requestedDeck(1) }).id);
  });
});
