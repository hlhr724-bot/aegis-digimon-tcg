import { expect, it } from "vitest";
import { catalogStoryBattles } from "@aegis/shared/story/catalogStoryBattles";
import { runBotMatch } from "#api/bot/matchHarness";
import { getStoryScenario } from "#api/story/getStoryScenario";
import { getStorySeatDeck } from "#api/story/getStorySeatDeck";

const matchups = [
  ...new Map(
    catalogStoryBattles.map((battle) => [`${battle.playerDeckRef}:${battle.opponentDeckRef}`, battle.id]),
  ).values(),
];

it.each(matchups)(
  "finishes the catalog deck matchup without an engine error for %s",
  async (battleId) => {
    const fixture = getStoryScenario(battleId)!;
    const result = await runBotMatch({
      seed: 42,
      turnLimit: 120,
      seats: [{ deck: getStorySeatDeck({ fixture, seat: 0 }) }, { deck: getStorySeatDeck({ fixture, seat: 1 }) }],
    });
    expect(result.errors).toEqual([]);
    expect(result.timedOut).toBe(false);
    expect(result.turnCount).toBeGreaterThan(0);
  },
  60_000,
);
