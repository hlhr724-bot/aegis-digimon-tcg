import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Seat } from "@aegis/shared/schema/enums";
import type { GameEngine } from "#api/engine/GameEngine";
import { runBotMatch } from "#api/bot/matchHarness";
import { createProjectedEvaluationPolicy } from "#api/bot/projectedPolicy";
import { mainActionReady } from "#api/bot/training/actions";
import { evolvedBotOptions, startEvolvedBots, stopEvolvedBots } from "#api/bot/evolution/livePolicy";
import { randomDeck } from "#api/bot/evolution/randomDecks";
import { runResidualMatch } from "#api/bot/evolution/residualMatch";
import { parseHeuristic } from "#api/bot/evolution/heuristic";

let directory: string | undefined;

afterEach(async () => {
  stopEvolvedBots();
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("live balanced residual catalog", () => {
  it.each([0, 1] as const)("reproduces the evaluation harness in learner seat %i", async (learnerSeat) => {
    const seed = 31_000_013;
    const decks = [randomDeck(1).deck, randomDeck(2).deck] as const;
    const catalog = JSON.parse(await readFile(new URL("./programs/certified-balanced.json", import.meta.url), "utf8"));
    const program = parseHeuristic(catalog.generic);
    directory = await mkdtemp(join(tmpdir(), "aegis-live-residual-"));
    const path = join(directory, "catalog.json");
    await writeFile(path, JSON.stringify(catalog));
    await startEvolvedBots({ AEGIS_BOT_HEURISTIC: path });
    const direct = await runResidualMatch({ seed, learnerSeat, decks, program });
    const seats = decks.map((deck, index) => ({
      deck,
      canChooseMainAction: mainActionReady,
      policyFactory(engine: GameEngine, seat: Seat) {
        return index === learnerSeat
          ? evolvedBotOptions({ engine, seat, seed, decks })!.policy!
          : createProjectedEvaluationPolicy({ engine, seat, seed: seed + seat * 7919 });
      },
    }));
    const live = await runBotMatch({
      seed,
      seats: [seats[0]!, seats[1]!],
      captureEvents: true,
      verifyProjections: true,
    });

    expect(direct.valid).toBe(true);
    expect(live.timedOut).toBe(false);
    expect(live.errors).toEqual([]);
    expect(live.rejections).toEqual([]);
    expect(live.seats.map((seat) => seat.inferenceFallbacks)).toEqual([
      { timeout: 0, error: 0 },
      { timeout: 0, error: 0 },
    ]);
    expect(live.projectionChecks).toBeGreaterThan(10);
    expect(live.projectionChecks).toBe(direct.result.projectionChecks);
    expect(live.winnerSeat).toBe(direct.result.winnerSeat);
    expect(live.reason).toBe(direct.result.reason);
    expect(live.turnCount).toBe(direct.result.turnCount);
    expect(live.events).toEqual(direct.result.events);
  });
});
