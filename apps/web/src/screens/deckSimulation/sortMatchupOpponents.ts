import type { MatchupOpponentResult } from "@aegis/shared/deckSimulation/MatchupJob";

export function sortMatchupOpponents(opponents: readonly MatchupOpponentResult[]): MatchupOpponentResult[] {
  return [...opponents].sort(
    (left, right) =>
      (right.score ?? -1) - (left.score ?? -1) ||
      right.completedGames - left.completedGames ||
      left.name.localeCompare(right.name),
  );
}
