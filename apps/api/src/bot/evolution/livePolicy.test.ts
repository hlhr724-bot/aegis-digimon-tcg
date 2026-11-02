import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { GameEngine } from "../../engine/GameEngine.js";
import { setupEngine } from "../../engine/testkit/index.js";
import { runBotMatch } from "../matchHarness.js";
import { startBotInference, stopBotInference } from "../inferenceRuntime.js";
import { mainActionReady } from "../training/actions.js";
import { evolutionDeck, EVOLUTION_DECK_VERSIONS } from "./decks.js";
import { SEED_HEURISTIC } from "./heuristic.js";
import { evolvedBotOptions, startEvolvedBots, stopEvolvedBots } from "./livePolicy.js";
import { randomDeck } from "./randomDecks.js";

let directory: string | undefined;
afterEach(async () => {
  stopEvolvedBots();
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

async function catalog(pilots: Record<string, unknown> = {}) {
  directory = await mkdtemp(join(tmpdir(), "aegis-policy-"));
  const path = join(directory, "policies.json");
  await writeFile(path, JSON.stringify({ schemaVersion: 1, generic: SEED_HEURISTIC, pilots }));
  return { AEGIS_BOT_HEURISTIC: path };
}

describe("live evolved bot integration", () => {
  it("waits for a loading heuristic catalog before shutdown clears it", async () => {
    const environment = await catalog();
    const starting = startBotInference(environment);
    const stopping = stopBotInference();
    await Promise.all([starting, stopping]);
    expect(
      evolvedBotOptions({ engine: setupEngine().engine, seat: 0, decks: [randomDeck(1).deck, randomDeck(2).deck] }),
    ).toBeUndefined();
  });
  it("selects a pilot only for its exact deck, independent of card ordering", async () => {
    const version = EVOLUTION_DECK_VERSIONS[0];
    await startEvolvedBots(await catalog({ [version]: { ...SEED_HEURISTIC, title: "Deck pilot" } }));
    const deck = evolutionDeck(version).deck;
    const opponent = randomDeck(1).deck;
    const engine = setupEngine().engine;
    expect(
      evolvedBotOptions({ engine, seat: 0, decks: [{ ...deck, mainDeck: [...deck.mainDeck].reverse() }, opponent] })
        ?.policy?.name,
    ).toBe("evolved:Deck pilot");
    expect(evolvedBotOptions({ engine, seat: 0, decks: [opponent, deck] })?.policy?.name).toBe(
      `evolved:${SEED_HEURISTIC.title}`,
    );
  });

  it("rejects simultaneous checkpoint configuration and unknown deck versions", async () => {
    const environment = await catalog({ unknown: SEED_HEURISTIC });
    await expect(startEvolvedBots({ ...environment, AEGIS_BOT_CHECKPOINT: "checkpoint" })).rejects.toThrow(
      "one bot policy",
    );
    await expect(startEvolvedBots(environment)).rejects.toThrow("Unknown heuristic deck");
    expect(
      evolvedBotOptions({
        engine: setupEngine().engine,
        seat: 0,
        decks: [randomDeck(1).deck, randomDeck(2).deck],
      }),
    ).toBeUndefined();
  });

  it("routes historical pilots by exact card counts and refuses two aliases for the same deck", async () => {
    const id = "bt8-blackwargreymon";
    const deck = evolutionDeck(id).deck;
    const pilot = { ...SEED_HEURISTIC, title: "BlackWarGreymon pilot" };
    await startEvolvedBots(await catalog({ [id]: pilot }));
    const engine = setupEngine().engine;
    const opponent = randomDeck(1).deck;
    expect(evolvedBotOptions({ engine, seat: 0, decks: [deck, opponent] })?.policy?.name).toBe(
      "evolved:BlackWarGreymon pilot",
    );
    const modified = { ...deck, mainDeck: [...deck.mainDeck] };
    modified.mainDeck[0] = "BT1-010";
    expect(evolvedBotOptions({ engine, seat: 0, decks: [modified, opponent] })?.policy?.name).toBe(
      `evolved:${SEED_HEURISTIC.title}`,
    );
    stopEvolvedBots();
    await rm(directory!, { recursive: true, force: true });
    await expect(startEvolvedBots(await catalog({ [id]: pilot, [`${id}@1`]: pilot }))).rejects.toThrow(
      "Duplicate heuristic deck multiset",
    );
    expect(evolvedBotOptions({ engine, seat: 0, decks: [deck, opponent] })).toBeUndefined();
  });

  it.each([0, 1] as const)(
    "finishes a real match in seat %s without fallback or projection leaks",
    async (learnerSeat) => {
      await startEvolvedBots(await catalog());
      const decks = [randomDeck(1).deck, randomDeck(2).deck] as const;
      const seats = decks.map((deck, seat) => ({
        deck,
        ...(seat === learnerSeat
          ? {
              policyFactory: (engine: GameEngine, botSeat: 0 | 1) =>
                evolvedBotOptions({ engine, seat: botSeat, decks })!.policy!,
              canChooseMainAction: mainActionReady,
              policyTimeoutMs: 1_000,
            }
          : {}),
      }));
      const result = await runBotMatch({
        seed: 42,
        seats: [seats[0]!, seats[1]!],
        turnLimit: 60,
        captureEvents: true,
        verifyProjections: true,
      });
      expect(result.timedOut).toBe(false);
      expect(result.reason).toBe("security");
      expect(result.errors).toEqual([]);
      expect(result.rejections).toEqual([]);
      expect(result.events!.filter((event) => event.kind === "actionRejected")).toEqual([]);
      expect(result.projectionChecks).toBeGreaterThan(10);
      expect(result.seats[learnerSeat].inferenceFallbacks).toEqual({ timeout: 0, error: 0 });
    },
  );
});
