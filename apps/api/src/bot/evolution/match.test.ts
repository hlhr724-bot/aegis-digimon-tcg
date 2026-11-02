import { describe, expect, it } from "vitest";
import { runBotMatch } from "../matchHarness.js";
import { mainActionReady } from "../training/actions.js";
import { createTrainingPolicy } from "../training/policy.js";
import { chooseHeuristic, SEED_HEURISTIC } from "./heuristic.js";
import { randomDeck } from "./randomDecks.js";
import { runEvolutionMatch } from "./evolutionMatch.js";

describe("heuristic evaluation on composed random decks", () => {
  it("reconstructs real-engine search rollouts without replay drift or policy fallbacks", async () => {
    const result = await runEvolutionMatch({
      seed: 42,
      learnerSeat: 0,
      decks: [randomDeck(1).deck, randomDeck(2).deck],
      program: SEED_HEURISTIC,
      mcts: { simulations: 2, seed: 619 },
      turnLimit: 60,
    });
    expect(result.valid).toBe(true);
    expect(result.searches.length).toBeGreaterThan(0);
    expect(result.searches.every((search) => search.completed === 2 && search.invalid === 0)).toBe(true);
    expect(
      result.result.seats.every((seat) => seat.inferenceFallbacks.error === 0 && seat.inferenceFallbacks.timeout === 0),
    ).toBe(true);
  }, 20000);
  it("scores turn-bounded search rollouts with the static position evaluation", async () => {
    const result = await runEvolutionMatch({
      seed: 42,
      learnerSeat: 0,
      decks: [randomDeck(1).deck, randomDeck(2).deck],
      program: SEED_HEURISTIC,
      mcts: { simulations: 4, seed: 619, startAfterDecisions: 16, maxSearches: 1, rolloutTurns: 1 },
      turnLimit: 60,
    });
    expect(result.valid).toBe(true);
    expect(result.searches).toHaveLength(1);
    expect(result.searches[0]).toMatchObject({ completed: 4, invalid: 0, leafEvaluations: 4 });
    expect(result.restoration.leafEvaluations).toBe(4);
  }, 20000);
  it("records advisory learner searches without changing the played game", async () => {
    const options = {
      seed: 42,
      learnerSeat: 0 as const,
      decks: [randomDeck(1).deck, randomDeck(2).deck] as const,
      program: SEED_HEURISTIC,
      mcts: { simulations: 2, seed: 619, startAfterDecisions: 16, maxSearches: 2 },
      turnLimit: 60,
      captureTraces: true,
    };
    const plain = await runEvolutionMatch(options);
    const advised = await runEvolutionMatch({
      ...options,
      teacher: { simulations: 4, seed: 911, maxSearches: 2, every: 3, rolloutTurns: 1 },
    });
    expect(advised.valid).toBe(true);
    expect(advised.result.winnerSeat).toBe(plain.result.winnerSeat);
    expect(advised.result.turnCount).toBe(plain.result.turnCount);
    expect(advised.decisions).toBe(plain.decisions);
    expect(advised.searches).toEqual(plain.searches);
    expect(advised.teacher).toEqual({ searches: 2, failures: 0 });
    const advice = advised.traces.flatMap((trace) =>
      (trace as { teacher?: { simulations: number; root: unknown[] } }).teacher === undefined
        ? []
        : [(trace as { teacher: { simulations: number; root: unknown[] } }).teacher],
    );
    expect(advice).toHaveLength(2);
    expect(advice.every((entry) => entry.simulations === 4 && entry.root.length > 1)).toBe(true);
  }, 30000);
  it.each([0, 1] as const)(
    "finishes a real game with learner seat %s and no hidden projection leak",
    async (learnerSeat) => {
      const seats = [1, 2].map((seed, index) => ({
        deck: randomDeck(seed).deck,
        ...(index !== learnerSeat
          ? {}
          : {
              policyFactory: (engine: Parameters<typeof createTrainingPolicy>[0], seat: 0 | 1) =>
                createTrainingPolicy(engine, seat, (window) => chooseHeuristic(SEED_HEURISTIC, window)),
              canChooseMainAction: mainActionReady,
              maxMainPhaseActions: Number.POSITIVE_INFINITY,
            }),
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
    },
  );
});
