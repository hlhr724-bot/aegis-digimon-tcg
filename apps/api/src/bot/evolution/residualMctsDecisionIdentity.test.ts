import { describe, expect, it } from "vitest";
import { BLUE_DECK, RED_DECK } from "#api/engine/testDecks";
import { SEED_HEURISTIC } from "#api/bot/evolution/heuristic";
import { SEED_RESIDUAL } from "#api/bot/evolution/residualPolicy";
import { runMctsResidualMatch } from "#api/bot/evolution/runMctsResidualMatch";

const PINNED_SEARCHES = [
  [
    [4, 1, 0.634136],
    [5, 1, 0.460085],
    [0, 1, 0.445221],
    [1, 1, 0.408541],
    [2, 1, 0.406127],
    [3, 1, 0.270912],
    [6, 0, 0],
    [7, 0, 0],
  ],
  [
    [1, 1, 0.450166],
    [5, 1, 0.415809],
    [0, 1, 0.408541],
    [2, 1, 0.336261],
    [3, 1, 0.295254],
    [4, 1, 0.191545],
    [6, 0, 0],
    [7, 0, 0],
    [8, 0, 0],
    [9, 0, 0],
    [10, 0, 0],
    [11, 0, 0],
  ],
  [
    [5, 1, 0.522485],
    [1, 1, 0.480011],
    [0, 1, 0.46257],
    [4, 1, 0.406127],
    [2, 1, 0.354344],
    [3, 1, 0.310026],
    [6, 0, 0],
    [7, 0, 0],
  ],
];

async function playPinnedMatch() {
  const game = await runMctsResidualMatch({
    seed: 719,
    learnerSeat: 0,
    decks: [RED_DECK, BLUE_DECK],
    program: SEED_RESIDUAL,
    simulations: 6,
    searchSeed: 917,
    maxSearches: 3,
    rolloutTurns: 1,
    moveOrderingProgram: SEED_HEURISTIC,
  });
  return {
    valid: game.valid,
    decisions: game.decisions,
    winnerSeat: game.result.winnerSeat,
    searches: game.searches.map((search) =>
      search.root.map(({ action, visits, meanReward }) => [action, visits, Number(meanReward.toFixed(6))]),
    ),
  };
}

describe("residual MCTS decision identity", () => {
  it("keeps the pinned root statistics and chosen actions for a fixed seed and rollout count", async () => {
    const game = await playPinnedMatch();
    expect(game).toEqual({ valid: true, decisions: 54, winnerSeat: 1, searches: PINNED_SEARCHES });
  }, 180_000);
});
