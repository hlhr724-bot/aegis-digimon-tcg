import { describe, expect, it } from "vitest";
import { BLUE_DECK, RED_DECK } from "#api/engine/testDecks";
import { evolutionDeck } from "#api/bot/evolution/decks";
import { runResidualMatch } from "#api/bot/evolution/residualMatch";
import { SEED_HEURISTIC } from "#api/bot/evolution/heuristic";
import { SEED_RESIDUAL } from "#api/bot/evolution/residualPolicy";
import { runMctsResidualMatch } from "#api/bot/evolution/runMctsResidualMatch";

describe("residual policy with real-engine MCTS", () => {
  it.each([
    { learnerSeat: 0, rolloutTurns: undefined },
    { learnerSeat: 1, rolloutTurns: undefined },
    { learnerSeat: 0, rolloutTurns: 200 },
    { learnerSeat: 1, rolloutTurns: 200 },
  ] as const)(
    "bounds rollout decisions in seat $learnerSeat with turn horizon $rolloutTurns",
    async ({ learnerSeat, rolloutTurns }) => {
      const game = await runMctsResidualMatch({
        seed: 719,
        learnerSeat,
        decks: [RED_DECK, BLUE_DECK],
        program: SEED_RESIDUAL,
        simulations: 4,
        searchSeed: 917,
        maxSearches: 2,
        maxRolloutDecisions: 2,
        rolloutTurns,
      });
      expect(game.valid).toBe(true);
      expect(game.result.reason).not.toBe("cancelled");
      expect(game.result.errors).toEqual([]);
      expect(game.result.rejections).toEqual([]);
      expect(game.searches).toHaveLength(2);
      for (const search of game.searches) {
        expect(search.completed).toBe(4);
        expect(search.invalid).toBe(0);
        expect(search.leafEvaluations).toBeGreaterThan(0);
        expect(search.leafEvaluations).toBeLessThanOrEqual(search.completed);
        expect(search.root.reduce((sum, row) => sum + row.visits, 0)).toBe(search.completed);
      }
      expect(game.result.seats.map((seat) => seat.inferenceFallbacks)).toEqual([
        { error: 0, timeout: 0 },
        { error: 0, timeout: 0 },
      ]);
    },
  );

  it("restores policy-ordered alternatives consistently through consecutive searches", async () => {
    const game = await runMctsResidualMatch({
      seed: 719,
      learnerSeat: 0,
      decks: [RED_DECK, BLUE_DECK],
      program: SEED_RESIDUAL,
      simulations: 4,
      searchSeed: 917,
      maxSearches: 2,
      rolloutTurns: 1,
      moveOrderingProgram: SEED_HEURISTIC,
    });
    expect(game.valid).toBe(true);
    expect(game.result.errors).toEqual([]);
    expect(game.result.rejections).toEqual([]);
    expect(game.searches).toHaveLength(2);
    expect(game.searches.every((search) => search.completed === 4 && search.invalid === 0)).toBe(true);
    expect(game.snapshotRestorations).toBe(8);
  });

  it.each([0, 1] as const)(
    "evaluates short rollouts without truncating the actual match in seat %i",
    async (learnerSeat) => {
      const game = await runMctsResidualMatch({
        seed: 719,
        learnerSeat,
        decks: [RED_DECK, BLUE_DECK],
        program: SEED_RESIDUAL,
        simulations: 4,
        searchSeed: 917,
        maxSearches: 2,
        rolloutTurns: 1,
      });
      expect(game.valid).toBe(true);
      expect(game.result.reason).not.toBe("cancelled");
      expect(game.result.errors).toEqual([]);
      expect(game.result.rejections).toEqual([]);
      expect(game.searches).toHaveLength(2);
      for (const search of game.searches) {
        expect(search.completed).toBe(4);
        expect(search.invalid).toBe(0);
        expect(search.leafEvaluations).toBeGreaterThan(0);
        expect(search.leafEvaluations).toBeLessThanOrEqual(search.completed);
      }
    },
  );

  it("completes a healthy match after a soft time budget stops search early", async () => {
    const game = await runMctsResidualMatch({
      seed: 719,
      learnerSeat: 0,
      decks: [RED_DECK, BLUE_DECK],
      program: SEED_RESIDUAL,
      simulations: 128,
      searchSeed: 917,
      maxSearches: 1,
      maxSearchTimeMs: Number.MIN_VALUE,
      exploration: 0,
    });
    expect(game.valid).toBe(true);
    expect(game.searches).toHaveLength(1);
    expect(game.searches[0]).toMatchObject({
      requested: 128,
      completed: 1,
      invalid: 0,
      timeBudget: { requestedMs: Number.MIN_VALUE, exhausted: true },
    });
    expect(game.result.errors).toEqual([]);
    expect(game.result.rejections).toEqual([]);
    expect(game.result.seats.map((seat) => seat.inferenceFallbacks)).toEqual([
      { error: 0, timeout: 0 },
      { error: 0, timeout: 0 },
    ]);
  });

  it.each([
    { maxRolloutDecisions: 0 },
    { maxRolloutDecisions: 1.5 },
    { maxRolloutDecisions: Infinity },
    { maxRolloutDecisions: 10001 },
    { rolloutTurns: 0 },
    { rolloutTurns: 1.5 },
    { exploration: -1 },
    { exploration: Infinity },
    { maxSearchTimeMs: 0 },
    { maxSearchTimeMs: NaN },
  ])("rejects invalid tuning before starting the engine: %j", async (settings) => {
    await expect(
      runMctsResidualMatch({
        seed: 719,
        learnerSeat: 0,
        decks: [RED_DECK, BLUE_DECK],
        program: SEED_RESIDUAL,
        simulations: 1,
        searchSeed: 917,
        ...settings,
      }),
    ).rejects.toThrow("Invalid residual MCTS search budget");
  });

  it.each([
    { learnerSeat: 0 as const, weight: 0 },
    { learnerSeat: 1 as const, weight: 0 },
    { learnerSeat: 0 as const, weight: 0.2 },
    { learnerSeat: 1 as const, weight: 0.2 },
  ])(
    "reproduces the unchanged policy in seat $learnerSeat with residual weight $weight",
    async ({ learnerSeat, weight }) => {
      const input = {
        seed: 719,
        learnerSeat,
        decks: [evolutionDeck("bt1-red-omnimon").deck, evolutionDeck("bt4-yellow-wargreymon").deck] as const,
        program: {
          ...SEED_RESIDUAL,
          rules: SEED_RESIDUAL.rules.map((rule) => ({
            ...rule,
            weight: rule.feature === "sourceDp" ? weight : 0,
          })),
        },
      };
      const control = await runResidualMatch(input);
      const search = await runMctsResidualMatch({ ...input, simulations: 0, searchSeed: 917 });
      expect(search.valid).toBe(true);
      expect(search.searches).toEqual([]);
      expect(search.result.winnerSeat).toBe(control.result.winnerSeat);
      expect(search.result.turnCount).toBe(control.result.turnCount);
      expect(search.result.events).toEqual(control.result.events);
    },
  );

  it.each([0, 1] as const)("restores a complete valid search in learner seat %i", async (learnerSeat) => {
    const game = await runMctsResidualMatch({
      seed: 719,
      learnerSeat,
      decks: [RED_DECK, BLUE_DECK],
      program: SEED_RESIDUAL,
      simulations: 2,
      searchSeed: 917,
      maxSearches: 1,
      startAfterDecisions: 4,
    });
    expect(game.result.errors).toEqual([]);
    expect(game.result.rejections).toEqual([]);
    expect(game.valid).toBe(true);
    expect(game.searches).toHaveLength(1);
    expect(game.searches[0]).toMatchObject({
      seat: learnerSeat,
      requested: 2,
      completed: 2,
      invalid: 0,
    });
    expect(game.searches[0]!.elapsedMs).toBeGreaterThan(0);
    expect(game.snapshotRestorations).toBeGreaterThan(0);
    expect(game.result.projectionChecks).toBeGreaterThan(0);
    expect(game.result.seats.map((seat) => seat.inferenceFallbacks)).toEqual([
      { error: 0, timeout: 0 },
      { error: 0, timeout: 0 },
    ]);
  });

  it("can place search on the opponent while retaining the residual learner", async () => {
    const game = await runMctsResidualMatch({
      seed: 719,
      learnerSeat: 0,
      searchSeat: 1,
      decks: [RED_DECK, BLUE_DECK],
      program: SEED_RESIDUAL,
      opponentProgram: SEED_RESIDUAL,
      simulations: 1,
      searchSeed: 917,
      maxSearches: 1,
    });
    expect(game.valid).toBe(true);
    expect(game.searches).toHaveLength(1);
    expect(game.searches[0]).toMatchObject({ seat: 1, requested: 1, completed: 1 });
  });

  it("restores later effect-driven decisions after an earlier searched move", async () => {
    const game = await runMctsResidualMatch({
      seed: 32000031,
      learnerSeat: 0,
      decks: [evolutionDeck("ex4-dgo-2022-06-25-1-ulforceveedramon").deck, evolutionDeck("bt8-blackwargreymon").deck],
      program: SEED_RESIDUAL,
      simulations: 2,
      searchSeed: 917,
      maxSearches: 2,
      startAfterDecisions: 8,
    });
    expect(game.result.errors).toEqual([]);
    expect(game.result.rejections).toEqual([]);
    expect(game.valid).toBe(true);
    expect(game.searches).toHaveLength(2);
    expect(game.searches.every((search) => search.completed === 2 && search.invalid === 0)).toBe(true);
    expect(game.result.projectionChecks).toBeGreaterThan(0);
  }, 30000);

  it("rejects invalid search counts before admitting a match", async () => {
    await expect(
      runMctsResidualMatch({
        seed: 719,
        learnerSeat: 0,
        decks: [RED_DECK, BLUE_DECK],
        program: SEED_RESIDUAL,
        simulations: -1,
        searchSeed: 917,
      }),
    ).rejects.toThrow("Invalid residual MCTS search budget");
  });

  it.each([{}, { rolloutTurns: 1 }, { maxRolloutDecisions: 2 }])(
    "keeps external cancellation invalid with rollout cutoff %j",
    async (cutoff) => {
      const controller = new AbortController();
      const game = await runMctsResidualMatch({
        seed: 719,
        learnerSeat: 0,
        decks: [RED_DECK, BLUE_DECK],
        program: SEED_RESIDUAL,
        simulations: 1,
        searchSeed: 917,
        ...cutoff,
        signal: controller.signal,
        onSearch: () => controller.abort(),
      });
      expect(game.valid).toBe(false);
      expect(game.result.reason).toBe("cancelled");
      expect(game.searches).toHaveLength(1);
    },
  );
});
