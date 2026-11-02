import { expect, it } from "vitest";
import { BotDifficulty } from "@aegis/shared/bot/BotDifficulty";
import type { BotStyle } from "@aegis/shared/bot/BotStyle";
import { catalogStoryBattles } from "@aegis/shared/story/catalogStoryBattles";
import { getStoryBattleDifficulty } from "@aegis/shared/story/getStoryBattleDifficulty";
import { StoryDifficulty } from "@aegis/shared/story/StoryDifficulty";
import { BOT_LEVEL_CONFIGS } from "#api/bot/levels/BOT_LEVEL_CONFIGS";
import { createLevelBotOptions } from "#api/bot/levels/createLevelBotOptions";
import { defaultStyleForDeck } from "#api/bot/levels/defaultStyleForDeck";
import { LEVEL_SEARCH_POLICY_TIMEOUT_MS } from "#api/bot/levels/LEVEL_SEARCH_POLICY_TIMEOUT_MS";
import { runBotMatch, type SeatConfig } from "#api/bot/matchHarness";
import { prewarmLiveSearchWorkers } from "#api/bot/search/prewarmLiveSearchWorkers";
import { mainActionReady } from "#api/bot/training/actions";
import type { Decklist } from "#api/engine/setup";
import { getStoryScenario } from "#api/story/getStoryScenario";
import { getStorySeatDeck } from "#api/story/getStorySeatDeck";
import { shuffleStoryDecks } from "#api/story/shuffleStoryDecks";

const isEnabled = process.env.STORY_BALANCE === "1";
const battlesPerDifficulty = Number(process.env.STORY_BALANCE_BATTLES ?? 12);
const seedsPerBattle = Number(process.env.STORY_BALANCE_SEEDS ?? 3);
const playerDifficulty = BotDifficulty.STANDARD.value;

type SeatParams = { deck: Decklist; difficulty: BotDifficulty; style: BotStyle; seed: number };

function createLevelSeat({ deck, difficulty, style, seed }: SeatParams): SeatConfig {
  const usesSearch = BOT_LEVEL_CONFIGS[difficulty].searchSimulations > 0;
  return {
    deck,
    label: `${difficulty}:${style}`,
    ...(usesSearch ? { policyTimeoutMs: LEVEL_SEARCH_POLICY_TIMEOUT_MS } : {}),
    canChooseMainAction: (engine) => mainActionReady(engine),
    policyFactory: (engine, seat) =>
      createLevelBotOptions({ engine, seat, deck, seed: seed + seat * 7919, difficulty, style }).policy!,
  };
}

async function getPlayerWinRate(battleIds: readonly string[]): Promise<number> {
  let wins = 0;
  let games = 0;
  for (const battleId of battleIds) {
    for (let seed = 1; seed <= seedsPerBattle; seed++) {
      const fixture = getStoryScenario(battleId)!;
      shuffleStoryDecks({ fixture, seed });
      const difficulty = getStoryBattleDifficulty({ battleId })!;
      const playerDeck = getStorySeatDeck({ fixture, seat: 0 });
      const opponentDeck = getStorySeatDeck({ fixture, seat: 1 });
      const result = await runBotMatch({
        seed,
        turnLimit: 60,
        fixture,
        seats: [
          createLevelSeat({
            deck: playerDeck,
            difficulty: playerDifficulty,
            style: defaultStyleForDeck({ deck: playerDeck }),
            seed,
          }),
          createLevelSeat({
            deck: opponentDeck,
            difficulty: difficulty.botDifficulty,
            style: difficulty.botStyle ?? defaultStyleForDeck({ deck: opponentDeck }),
            seed,
          }),
        ],
      });
      expect(result.errors).toEqual([]);
      games++;
      if (result.winnerSeat === 0) {
        wins++;
      }
    }
  }
  return wins / games;
}

it.runIf(isEnabled)(
  "lowers the player bot win rate as story difficulty rises",
  async () => {
    if (Object.values(StoryDifficulty).some((entry) => BOT_LEVEL_CONFIGS[entry.botDifficulty].searchSimulations > 0)) {
      await prewarmLiveSearchWorkers();
    }
    const rates = new Map<string, number>();
    for (const difficulty of Object.values(StoryDifficulty)) {
      const battleIds = catalogStoryBattles
        .filter(
          (battle) => battle.playable && getStoryBattleDifficulty({ battleId: battle.id })?.value === difficulty.value,
        )
        .map((battle) => battle.id);
      const step = Math.max(1, Math.floor(battleIds.length / battlesPerDifficulty));
      const sample = battleIds.filter((_, index) => index % step === 0).slice(0, battlesPerDifficulty);
      rates.set(difficulty.value, await getPlayerWinRate(sample));
    }
    process.stderr.write(`\n${JSON.stringify(Object.fromEntries(rates))}\n`);
    expect(rates.get(StoryDifficulty.INTRO.value)!).toBeGreaterThan(rates.get(StoryDifficulty.BOSS.value)!);
  },
  7_200_000,
);
