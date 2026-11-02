import type { Client } from "colyseus";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_FAMOUS_DECKS } from "@aegis/shared/decks/index";
import type { Intent } from "@aegis/shared/protocol/intents";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import { Phase } from "@aegis/shared/schema/enums";
import type { AccountStore } from "#api/accounts/AccountStore";
import type { BotOptions, BotPlayer } from "#api/bot/BotPlayer";
import { startBotInference, stopBotInference } from "#api/bot/inferenceRuntime";
import { humanPanelProgram } from "#api/bot/experiment/humanPanelProgram";
import { trainingDeck, TRAINING_DECK_VERSIONS } from "#api/bot/training/decks";
import type { ReplayLibrary } from "#api/replays/ReplayLibrary";
import { AegisRoom } from "#api/rooms/AegisRoom";

let room: AegisRoom | undefined;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(async () => {
  room?.onDispose();
  room?.clock.stop();
  room = undefined;
  await stopBotInference();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function experimentEnvironment(arms: Record<string, number>) {
  return { AEGIS_BOT_EXPERIMENT: JSON.stringify({ id: "bot-ab-test", arms }) };
}

async function seatBot(environment: NodeJS.ProcessEnv = {}) {
  await startBotInference(environment);
  const created = new AegisRoom();
  room = created;
  created.lock = vi.fn<() => Promise<void>>(async () => {});
  created.unlock = vi.fn<() => Promise<void>>(async () => {});
  created.setMatchmaking = vi.fn<AegisRoom["setMatchmaking"]>(async (updates) => {
    if (updates.maxClients !== undefined) {
      created.maxClients = updates.maxClients;
    }
  });
  const events: ServerEvent[] = [];
  created.broadcast = vi.fn<AegisRoom["broadcast"]>((_, event) => {
    events.push(event as ServerEvent);
    return true;
  });
  const recordRecentMatch = vi.fn<AccountStore["recordRecentMatch"]>(async () => {});
  Reflect.set(created, "accounts", () => ({ recordRecentMatch }));
  Reflect.set(created, "replays", () => ({ record: vi.fn<ReplayLibrary["record"]>(async () => "index-id") }));
  created.onCreate({ botRoom: true, seed: 2 });
  const human = { sessionId: "human", send: vi.fn<() => void>() } as unknown as Client;
  created.clients.push(human);
  created.onJoin(human, { displayName: "Human", deck: trainingDeck(TRAINING_DECK_VERSIONS[0]).deck });
  (Reflect.get(created, "accountByClient") as Map<string, string>).set(human.sessionId, "human-account");
  const deckId = ALL_FAMOUS_DECKS.find((deck) => deck.deckVersion === TRAINING_DECK_VERSIONS[1])!.deckId;
  expect(created.addBot(deckId)).toBe(true);
  const bot = (Reflect.get(created, "bots") as BotPlayer[])[1]!;
  const surrender = async () => {
    Reflect.get(created, "handleIntent").call(created, human, { type: "surrender" } satisfies Intent);
    await vi.waitFor(() => expect(recordRecentMatch).toHaveBeenCalledOnce());
    return recordRecentMatch.mock.calls[0]![2];
  };
  return { room: created, human, bot, events, surrender };
}

describe("bot A/B experiment in practice rooms", () => {
  it("seats the production legacy bot and records no arm when the experiment is off", async () => {
    const { bot, surrender } = await seatBot();
    expect(bot.policyName).toMatch(/^level:standard:[a-z]+:evaluation:/);
    const record = await surrender();
    expect(record).toMatchObject({ mode: "bot", opponentKind: "bot", result: "loss", reason: "surrender" });
    expect(record).not.toHaveProperty("botArm");
    expect(record).not.toHaveProperty("botExperiment");
  });

  it("seats the assigned candidate arm and records it on the human's match", async () => {
    const { bot, surrender } = await seatBot(experimentEnvironment({ humanPanelPlanner: 100 }));
    expect(bot.policyName).toBe(`experiment:humanPanelPlanner:${humanPanelProgram.program.title}`);
    const record = await surrender();
    expect(record).toMatchObject({ botExperiment: "bot-ab-test", botArm: "humanPanelPlanner", result: "loss" });
    expect(record).not.toHaveProperty("botArmFallback");
  });

  it("plays main-phase actions with the candidate planner without rejections", async () => {
    const {
      room: seated,
      human,
      bot,
      events,
      surrender,
    } = await seatBot(experimentEnvironment({ humanPanelPlanner: 100 }));
    const send = (intent: Intent) => Reflect.get(seated, "handleIntent").call(seated, human, intent);
    send({ type: "mulligan", keep: true });
    await vi.advanceTimersByTimeAsync(6_000);
    for (let phase = 0; phase < 2 && seated.state.turnSeat === 0; phase++) {
      expect([Phase.Breeding, Phase.Main]).toContain(seated.state.phase);
      send({ type: "endPhase" });
      await vi.advanceTimersByTimeAsync(0);
    }
    const played = () =>
      events.some((event) => (event.kind === "cardPlayed" || event.kind === "digivolved") && event.seat === 1);
    for (let tick = 0; tick < 200 && !played(); tick++) {
      await vi.advanceTimersByTimeAsync(100);
      seated.clock.tick();
    }
    expect(played()).toBe(true);
    expect(events.filter((event) => event.kind === "actionRejected")).toEqual([]);
    expect(bot.inferenceFallbacks).toEqual({ timeout: 0, error: 0 });
    expect(await surrender()).not.toHaveProperty("botArmFallback");
  });

  it("seats the legacy evaluation bot for the legacy arm", async () => {
    const { bot, surrender } = await seatBot(experimentEnvironment({ legacy: 100 }));
    expect(bot.policyName).toMatch(/^level:standard:[a-z]+:evaluation:/);
    expect(await surrender()).toMatchObject({ botArm: "legacy" });
  });

  it("seats the certified residual bot for the certified arm", async () => {
    const { bot, surrender } = await seatBot(experimentEnvironment({ certified: 100 }));
    expect(bot.policyName).toMatch(/^(certified|validated-pilot):/);
    expect(await surrender()).toMatchObject({ botArm: "certified" });
  });

  it("records that the candidate fell back to the legacy bot after a rejected action", async () => {
    const { bot, surrender } = await seatBot(experimentEnvironment({ humanPanel: 100 }));
    const options = Reflect.get(bot, "options") as BotOptions;
    options.policy!.noteRejected({ type: "endPhase" });
    expect(await surrender()).toMatchObject({ botArm: "humanPanel", botArmFallback: true });
  });
});
