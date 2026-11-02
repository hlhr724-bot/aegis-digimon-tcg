import type { TournamentCircuitPointsTier } from "#shared/tournaments/circuits/TournamentCircuitContracts";

export const DEFAULT_CIRCUIT_SETTINGS = {
  leadTimeMs: 48 * 3_600_000,
  checkInWindowMs: 15 * 60_000,
  participationPoints: 1,
  pointsTable: [
    { maxPlacement: 1, points: 25 },
    { maxPlacement: 2, points: 18 },
    { maxPlacement: 4, points: 12 },
    { maxPlacement: 8, points: 8 },
  ] satisfies TournamentCircuitPointsTier[],
} as const;
