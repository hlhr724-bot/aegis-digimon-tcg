import { TournamentCircuitCadence } from "#shared/tournaments/circuits/TournamentCircuitCadence";

export function isTournamentCircuitCadence(value: unknown): value is TournamentCircuitCadence {
  return (
    typeof value === "string" && Object.values(TournamentCircuitCadence).some((cadence) => cadence.value === value)
  );
}
