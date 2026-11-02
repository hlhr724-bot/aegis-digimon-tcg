import { describe, expect, it } from "vitest";
import { runEvolutionMatch } from "#api/bot/evolution/evolutionMatch";
import { SEED_HEURISTIC } from "#api/bot/evolution/heuristic";
import { randomDeck } from "#api/bot/evolution/randomDecks";
import type { Seat } from "@aegis/shared/schema/enums";

type SearchCase = { learnerSeat: Seat; seed: number; fullGame: boolean };

async function expectSeededSearchPreserved({ learnerSeat, seed, fullGame }: SearchCase) {
  const schedule = fullGame ? {} : { startAfterDecisions: 8, maxSearches: 1 };
  const options = {
    seed,
    learnerSeat,
    decks: [randomDeck(1).deck, randomDeck(2).deck] as const,
    program: SEED_HEURISTIC,
    turnLimit: 60,
    captureTraces: true,
  };
  const reference = await runEvolutionMatch({
    ...options,
    mcts: { simulations: 4, seed: 619, ...schedule },
  });
  const accelerated = await runEvolutionMatch({
    ...options,
    mcts: { simulations: 4, seed: 619, ...schedule, omitRolloutHandAffordances: true },
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
  expect(accelerated.searches.every((search) => search.completed === 4 && search.invalid === 0)).toBe(true);
}

describe("MCTS rollouts without client hand affordances", () => {
  it.each([
    { learnerSeat: 0, seed: 42, fullGame: false },
    { learnerSeat: 1, seed: 42, fullGame: false },
  ] as const)(
    "preserves the seeded search for $seed in learner seat $learnerSeat",
    expectSeededSearchPreserved,
    300000,
  );

  it.each([
    { learnerSeat: 0, seed: 450010100, fullGame: true },
    { learnerSeat: 1, seed: 450010100, fullGame: true },
  ] as const)(
    "preserves the seeded search for $seed in learner seat $learnerSeat",
    expectSeededSearchPreserved,
    1200000,
  );
});
