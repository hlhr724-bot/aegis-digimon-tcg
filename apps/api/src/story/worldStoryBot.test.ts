import { expect, it } from "vitest";
import { runBotMatch } from "#api/bot/matchHarness";
import { getStoryScenario } from "#api/story/getStoryScenario";
import { getStorySeatDeck } from "#api/story/getStorySeatDeck";

it.each(["dw1-001", "dw1-002", "dw1-003", "dw1-009"])(
  "plays the borrowed matchup through the real bot engine for %s",
  async (battleId) => {
    const fixture = getStoryScenario(battleId)!;
    const result = await runBotMatch({
      seed: 42,
      turnLimit: 60,
      seats: [{ deck: getStorySeatDeck({ fixture, seat: 0 }) }, { deck: getStorySeatDeck({ fixture, seat: 1 }) }],
    });
    expect(result.errors).toEqual([]);
    expect(result.timedOut).toBe(false);
    expect(result.winnerSeat).toBeDefined();
  },
  60_000,
);
