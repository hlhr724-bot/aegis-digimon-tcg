import { describe, expect, it } from "vitest";
import { runEvolutionMatch } from "#api/bot/evolution/evolutionMatch";
import { SEED_HEURISTIC } from "#api/bot/evolution/heuristic";
import { randomDeck } from "#api/bot/evolution/randomDecks";

describe("real-engine MCTS prefix restoration", () => {
  it.each([0, 1] as const)(
    "preserves the entire seeded search in learner seat %i",
    async (learnerSeat) => {
      const options = {
        seed: 42,
        learnerSeat,
        decks: [randomDeck(1).deck, randomDeck(2).deck] as const,
        program: SEED_HEURISTIC,
        turnLimit: 60,
        captureTraces: true,
      };
      const reference = await runEvolutionMatch({
        ...options,
        mcts: { simulations: 4, seed: 619, reusePrefixActions: false },
      });
      const accelerated = await runEvolutionMatch({
        ...options,
        mcts: { simulations: 4, seed: 619 },
      });
      expect(reference.valid).toBe(true);
      expect(accelerated.valid).toBe(true);
      expect({
        ...accelerated.result,
        seats: accelerated.result.seats.map(({ decisionLatenciesMs: _decisionLatenciesMs, ...stats }) => stats),
      }).toEqual({
        ...reference.result,
        seats: reference.result.seats.map(({ decisionLatenciesMs: _decisionLatenciesMs, ...stats }) => stats),
      });
      expect(accelerated.searches).toEqual(reference.searches);
      expect(accelerated.traces).toEqual(reference.traces);
      expect(accelerated.decisions).toBe(reference.decisions);
      expect(accelerated.restoration.replays).toBe(reference.restoration.replays);
      expect(accelerated.restoration.replayedWindows).toBe(reference.restoration.replayedWindows);
      expect(accelerated.restoration.enumeratedMainCatalogs).toBe(0);
      expect(accelerated.restoration.reusedActionIndices).toBe(accelerated.restoration.replayedWindows);
      expect(reference.restoration.reusedActionIndices).toBe(0);
      expect(reference.restoration.reusedMainCatalogs).toBe(0);
      expect(accelerated.restoration.reusedMainCatalogs).toBeGreaterThan(0);
      expect(accelerated.restoration.reusedMainCatalogs).toBe(reference.restoration.enumeratedMainCatalogs);
      expect(accelerated.searches.every((search) => search.completed === 4 && search.invalid === 0)).toBe(true);
    },
    300000,
  );
});
