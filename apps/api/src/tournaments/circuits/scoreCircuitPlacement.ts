import type { TournamentCircuitPointsTier } from "@aegis/shared/tournaments/circuits/TournamentCircuitContracts";

type Params = {
  placement: number | null;
  pointsTable: readonly TournamentCircuitPointsTier[];
  participationPoints: number;
};

export function scoreCircuitPlacement({ placement, pointsTable, participationPoints }: Params): number {
  if (placement === null) {
    return participationPoints;
  }
  const tier = pointsTable.find((entry) => placement <= entry.maxPlacement);
  return participationPoints + (tier?.points ?? 0);
}
