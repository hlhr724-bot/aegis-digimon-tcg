import { describe, expect, it } from "vitest";
import type { Intent, Seat } from "@aegis/shared";
import { BotDifficulty } from "@aegis/shared/bot/BotDifficulty";
import { BotStyle } from "@aegis/shared/bot/BotStyle";
import type { GameEngine } from "#api/engine/GameEngine";
import { BLUE_DECK, RED_DECK } from "#api/engine/testDecks";
import { runBotMatch } from "#api/bot/matchHarness";
import { createLevelBotOptions } from "#api/bot/levels/createLevelBotOptions";
import { mainActionReady } from "#api/bot/training/actions";

async function playStandardGame({ seed, headless }: { seed: number; headless: boolean }) {
  const intents: string[] = [];
  const decks = [RED_DECK, BLUE_DECK] as const;
  const seats = ([0, 1] as const).map((seat) => ({
    deck: decks[seat],
    canChooseMainAction: mainActionReady,
    policyFactory: (engine: GameEngine, policySeat: Seat) => {
      const policy = createLevelBotOptions({
        engine,
        seat: policySeat,
        deck: decks[seat],
        seed: seed + policySeat * 7919,
        difficulty: BotDifficulty.STANDARD.value,
        style: BotStyle.BALANCED.value,
      }).policy!;
      return {
        ...policy,
        chooseMainAction: (...args: Parameters<typeof policy.chooseMainAction>) => {
          const intent = policy.chooseMainAction(...args) as Intent;
          intents.push(`${policySeat}:${JSON.stringify(intent)}`);
          return intent;
        },
      };
    },
  }));
  const match = await runBotMatch({ seed, seats: [seats[0]!, seats[1]!], turnLimit: 60, headless });
  return { intents, winnerSeat: match.winnerSeat, reason: match.reason, turns: match.turnCount, errors: match.errors };
}

describe("headless bot matches", () => {
  it.each([4242, 9100])(
    "make the same Standard decisions as a client-projected match for seed %i",
    async (seed) => {
      const projected = await playStandardGame({ seed, headless: false });
      const headless = await playStandardGame({ seed, headless: true });
      expect(projected.errors).toEqual([]);
      expect(projected.intents.length).toBeGreaterThan(10);
      expect(headless).toEqual(projected);
    },
    120_000,
  );
});
