import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Client } from "colyseus";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { botPersonaForDeck } from "@aegis/shared/bot/personas/botPersonaForDeck";
import { ALL_FAMOUS_DECKS } from "@aegis/shared/decks/index";
import type { Intent } from "@aegis/shared/protocol/intents";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import { Phase } from "@aegis/shared/schema/enums";
import type { BotPlayer } from "#api/bot/BotPlayer";
import { InferenceClient } from "#api/bot/training/inferenceClient";
import { trainingDeck, TRAINING_DECK_VERSIONS } from "#api/bot/training/decks";
import { startBotInference, stopBotInference } from "#api/bot/inferenceRuntime";
import * as residualPolicies from "#api/bot/evolution/residualPolicy";
import { parseHeuristic } from "#api/bot/evolution/heuristic";
import { AegisRoom } from "#api/rooms/AegisRoom";

vi.hoisted(() => {
  vi.resetModules();
});

vi.mock("#api/bot/evolution/residualPolicy", async (importOriginal) => {
  const original = await importOriginal<typeof import("#api/bot/evolution/residualPolicy")>();
  return {
    ...original,
    createResidualPolicy: vi.fn<typeof original.createResidualPolicy>(original.createResidualPolicy),
  };
});

let directory: string | undefined;
let room: AegisRoom | undefined;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(async () => {
  room?.onDispose();
  room?.clock.stop();
  room = undefined;
  await stopBotInference();
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
  vi.mocked(residualPolicies.createResidualPolicy).mockRestore();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("evolved policy in practice rooms", () => {
  it("loads the catalog before admission and drives the room with the match-seeded policy", async () => {
    const seed = 2;
    const catalog = JSON.parse(
      await readFile(new URL("../bot/evolution/programs/certified-balanced.json", import.meta.url), "utf8"),
    );
    const program = parseHeuristic(catalog.generic);
    directory = await mkdtemp(join(tmpdir(), "aegis-room-residual-"));
    const path = join(directory, "catalog.json");
    await writeFile(path, JSON.stringify(catalog));
    const worker = vi.spyOn(InferenceClient, "start");
    const original = vi.mocked(residualPolicies.createResidualPolicy).getMockImplementation()!;
    const action = vi.fn<() => void>();
    const factory = vi.mocked(residualPolicies.createResidualPolicy).mockImplementation((input) => {
      const policy = original(input);
      return {
        ...policy,
        chooseMainAction(view, signal) {
          action();
          return policy.chooseMainAction(view, signal);
        },
      };
    });
    await startBotInference({ AEGIS_BOT_HEURISTIC: path });
    room = new AegisRoom();
    room.lock = vi.fn<() => Promise<void>>(async () => {});
    room.unlock = vi.fn<() => Promise<void>>(async () => {});
    room.setMatchmaking = vi.fn<AegisRoom["setMatchmaking"]>(async (updates) => {
      if (updates.maxClients !== undefined) room!.maxClients = updates.maxClients;
    });
    const events: ServerEvent[] = [];
    room.broadcast = vi.fn<AegisRoom["broadcast"]>((_, event) => {
      events.push(event as ServerEvent);
      return true;
    });
    room.onCreate({ botRoom: true, seed });
    const human = { sessionId: "human", send: vi.fn<() => void>() } as unknown as Client;
    room.clients.push(human);
    room.onJoin(human, { displayName: "Human", deck: trainingDeck(TRAINING_DECK_VERSIONS[0]).deck });
    const deckId = ALL_FAMOUS_DECKS.find((deck) => deck.deckVersion === TRAINING_DECK_VERSIONS[1])!.deckId;
    expect(room.addBot(deckId)).toBe(true);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory.mock.calls[0]![0].seat).toBe(1);
    expect(factory.mock.calls[0]![0].seed).toBe(seed + 7919);
    expect(factory.mock.calls[0]![0].program).toEqual(program);
    expect(worker).not.toHaveBeenCalled();
    const bot = (room as unknown as { bots: BotPlayer[] }).bots[1]!;
    expect(bot.policyName).toBe(`evolved:${program.title}`);
    expect(room.state.players[1]!.displayName).toBe(botPersonaForDeck({ deckId }).displayName);
    expect(room.state.players[1]!.botPersonaId).toBe(botPersonaForDeck({ deckId }).id);
    const internal = room as unknown as { handleIntent: (client: Client, intent: Intent) => void };
    internal.handleIntent(human, { type: "mulligan", keep: true });
    await vi.advanceTimersByTimeAsync(6_000);
    expect(room.state.players[1]!.hasMulliganed).toBe(true);
    for (let phase = 0; phase < 2 && room.state.turnSeat === 0; phase++) {
      expect([Phase.Breeding, Phase.Main]).toContain(room.state.phase);
      internal.handleIntent(human, { type: "endPhase" });
      await vi.advanceTimersByTimeAsync(0);
    }
    for (let tick = 0; tick < 200 && action.mock.calls.length === 0; tick++) {
      await vi.advanceTimersByTimeAsync(100);
      room.clock.tick();
    }
    expect(action).toHaveBeenCalled();
    expect(
      events.some((event) => (event.kind === "cardPlayed" || event.kind === "digivolved") && event.seat === 1),
    ).toBe(true);
    expect(events.filter((event) => event.kind === "actionRejected")).toEqual([]);
    expect(bot.inferenceFallbacks).toEqual({ timeout: 0, error: 0 });
  });
});
