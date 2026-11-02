import type { TournamentCircuitStanding } from "@aegis/shared/tournaments/circuits/TournamentCircuitContracts";

export type CircuitStandingTotals = Omit<TournamentCircuitStanding, "position">;

export function rankCircuitStandings(totals: readonly CircuitStandingTotals[]): TournamentCircuitStanding[] {
  const ordered = [...totals].sort(
    (left, right) =>
      right.points - left.points ||
      compareBestPlacement(left.bestPlacement, right.bestPlacement) ||
      left.displayName.localeCompare(right.displayName) ||
      left.accountId.localeCompare(right.accountId),
  );
  let position = 0;
  return ordered.map((entry, index) => {
    const previous = ordered[index - 1];
    if (!previous || previous.points !== entry.points || previous.bestPlacement !== entry.bestPlacement) {
      position = index + 1;
    }
    return { ...entry, position };
  });
}

function compareBestPlacement(left: number | null, right: number | null): number {
  return (left ?? Number.POSITIVE_INFINITY) - (right ?? Number.POSITIVE_INFINITY);
}
