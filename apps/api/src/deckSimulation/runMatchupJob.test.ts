import { describe, expect, it } from "vitest";
import { BLUE_DECK, RED_DECK } from "#api/engine/testDecks";
import type { MatchupGameOutcome } from "#api/deckSimulation/MatchupGameOutcome";
import type { MatchupJobTask } from "#api/deckSimulation/MatchupJobTask";
import { runMatchupJob } from "#api/deckSimulation/runMatchupJob";

function createTask(overrides: Partial<MatchupJobTask> = {}): MatchupJobTask {
  return {
    jobId: "job",
    request: { deck: RED_DECK, opponent: BLUE_DECK, opponentName: "Blue", games: 10 },
    seed: 4242,
    sampleLimit: 1,
    deadlineEpochMs: Date.now() + 600_000,
    ...overrides,
  };
}

describe("runMatchupJob", () => {
  it("plays Standard bots with alternating first player and records only the sample replays", async () => {
    const games: { index: number; playerFirst: boolean; outcome: MatchupGameOutcome }[] = [];
    let calls = 0;
    const end = await runMatchupJob({
      task: createTask(),
      signal: new AbortController().signal,
      now: () => (calls++ < 2 ? 0 : Number.MAX_SAFE_INTEGER),
      onGame: (game) => games.push(game),
    });
    expect(end).toBe("timed-out");
    expect(games.map((game) => [game.index, game.playerFirst])).toEqual([
      [0, true],
      [1, false],
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
