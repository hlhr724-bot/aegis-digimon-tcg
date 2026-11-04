import { describe, expect, it } from "vitest";
import type { MatchupOpponentResult } from "@aegis/shared/deckSimulation/MatchupJob";
import { sortMatchupOpponents } from "@/screens/deckSimulation/sortMatchupOpponents";

function opponent(name: string, score: number | null, completedGames: number): MatchupOpponentResult {
  return {
    name,
    requestedGames: 8,
    completedGames,
    wins: 0,
    losses: 0,
    draws: 0,
    invalidGames: 0,
    score,
    interval: null,
  };
}

describe("sortMatchupOpponents", () => {
  it("puts the best score first, unplayed opponents last and breaks ties by games played", () => {
    const sorted = sortMatchupOpponents([
      opponent("Waiting", null, 0),
      opponent("Low", 0.25, 8),
      opponent("High few", 0.75, 2),
      opponent("High many", 0.75, 8),
    ]);
    expect(sorted.map((entry) => entry.name)).toEqual(["High many", "High few", "Low", "Waiting"]);
  });
});
