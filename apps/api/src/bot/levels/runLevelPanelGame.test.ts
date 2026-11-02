import { describe, expect, it } from "vitest";
import { runLevelPanelGame } from "#api/bot/levels/runLevelPanelGame";
import { RED_DECK, BLUE_DECK } from "#api/engine/testDecks";

const input = {
  seed: 42,
  seat: 0,
  difficulty: "standard",
  style: "balanced",
  reference: "legacy-balanced",
  decks: [RED_DECK, BLUE_DECK],
};

const simulationBoundTiming = { searchBudgetMs: 60_000, decisionDeadlineMs: 60_000, policyTimeoutMs: 120_000 };

describe("headless level panel protocol", () => {
  it("runs a real configured match and returns strength, style and computation measurements", async () => {
    const result = await runLevelPanelGame(input);
    expect(result.valid).toBe(true);
    expect(result.turn).toBeGreaterThan(0);
    expect(result.style.gameLengthTurns).toBeGreaterThan(0);
    expect(result.latencies[0]!.length).toBeGreaterThan(0);
  });

  it.each([42, 43, 44, 5000, 5001])(
    "finishes a simulation-bound Expert test-deck match without search fallbacks at seed %i",
    async (seed) => {
      const result = await runLevelPanelGame(
        { ...input, seed, difficulty: "expert", reference: "random-legal" },
        { searchTiming: simulationBoundTiming },
      );
      expect(result.problem).toBeUndefined();
      expect(result.searchErrors[0]).toEqual({});
      expect(result.searchFallbacks[0]).toEqual({ deadline: 0, capacity: 0, error: 0 });
    },
    60000,
  );

  it.each([
    null,
    { ...input, difficulty: "constructor" },
    { ...input, style: "constructor" },
    { ...input, reference: "constructor" },
    { ...input, seed: -1 },
    { ...input, seat: 2 },
    { ...input, decks: [] },
    { ...input, decks: [{ mainDeck: [], eggDeck: [] }, BLUE_DECK] },
    { ...input, reference: "selected-level" },
  ])("rejects malformed panel requests before starting a match: %j", async (value) => {
    await expect(runLevelPanelGame(value)).rejects.toThrow(/Invalid|Illegal|require|needs/);
  });
});
