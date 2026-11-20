import { describe, expect, it } from "vitest";
import { BLUE_DECK, RED_DECK } from "#api/engine/testDecks";
import { SEED_HEURISTIC } from "#api/bot/evolution/heuristic";
import { SEED_RESIDUAL } from "#api/bot/evolution/residualPolicy";
import { runMctsResidualMatch } from "#api/bot/evolution/runMctsResidualMatch";

const PINNED_SEARCHES = [
  [
    [5, 1, 0.62567],
    [4, 1, 0.533233],
    [1, 1, 0.476053],
    [0, 1, 0.459611],
    [2, 1, 0.40127],
    [3, 1, 0.313388],
    [6, 0, 0],
    [7, 0, 0],
  ],
  [
    [5, 1, 0.384535],
    [1, 1, 0.34585],
    [0, 1, 0.24343],
    [3, 1, 0.16556],
    [2, 1, 0.133113],
    [4, 1, 0.08475],
    [6, 0, 0],
    [7, 0, 0],
  ],
  [
    [1, 1, 0.217693],
    [2, 1, 0.156703],
    [3, 1, 0.125865],
    [4, 1, 0.109699],
    [0, 1, 0.098222],
    [5, 1, 0.03671],
    [6, 0, 0],
    [7, 0, 0],
    [8, 0, 0],
    [9, 0, 0],
    [10, 0, 0],
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
    expect(game).toEqual({ valid: true, decisions: 35, winnerSeat: 1, searches: PINNED_SEARCHES });
  }, 180_000);
});
