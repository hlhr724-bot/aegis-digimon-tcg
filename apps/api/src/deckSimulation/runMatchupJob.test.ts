import { describe, expect, it } from "vitest";
import { BLUE_DECK, RED_DECK } from "#api/engine/testDecks";
import type { MatchupGameOutcome } from "#api/deckSimulation/MatchupGameOutcome";
import type { MatchupJobTask } from "#api/deckSimulation/MatchupJobTask";
import { runMatchupJob } from "#api/deckSimulation/runMatchupJob";

function createTask(overrides: Partial<MatchupJobTask> = {}): MatchupJobTask {
  return {
    jobId: "job",
    request: {
      deck: RED_DECK,
      opponents: [
        { name: "Blue", deck: BLUE_DECK },
        { name: "Red", deck: RED_DECK },
      ],
      gamesPerOpponent: 1,
    },
    seed: 4242,
    sampleLimit: 1,
    deadlineEpochMs: Date.now() + 600_000,
    ...overrides,
  };
}

describe("runMatchupJob", () => {
  it("plays each opponent in turn with Standard bots and records only the sample replays", async () => {
    const games: { index: number; opponentIndex: number; playerFirst: boolean; outcome: MatchupGameOutcome }[] = [];
    const end = await runMatchupJob({
      task: createTask(),
      signal: new AbortController().signal,
      onGame: (game) => games.push(game),
    });
    expect(end).toBe("completed");
    expect(games.map((game) => [game.index, game.opponentIndex, game.playerFirst])).toEqual([
      [0, 0, true],
      [1, 1, true],
    ]);
    expect(games.every((game) => game.outcome.result !== undefined && game.outcome.turns > 0)).toBe(true);
    expect(games[0]!.outcome.replay?.inputs.length).toBeGreaterThan(0);
    expect(games[1]!.outcome.replay).toBeUndefined();
  }, 300_000);

  it("stops before the first game when the time budget is already spent", async () => {
    const games: unknown[] = [];
    const end = await runMatchupJob({
      task: createTask({ deadlineEpochMs: 0 }),
      signal: new AbortController().signal,
      onGame: (game) => games.push(game),
    });
    expect(end).toBe("timed-out");
    expect(games).toEqual([]);
  });

  it("reports a cancelled job without playing", async () => {
    const controller = new AbortController();
    controller.abort();
    const end = await runMatchupJob({ task: createTask(), signal: controller.signal, onGame: () => {} });
    expect(end).toBe("cancelled");
  });
});
