export const TournamentCircuitCadence = {
  WEEKLY: {
    name: "WEEKLY",
    value: "weekly",
    firstDay: 0,
    lastDay: 6,
    labelKey: "tournaments.circuits.cadence.weekly",
  },
  MONTHLY: {
    name: "MONTHLY",
    value: "monthly",
    firstDay: 1,
    lastDay: 31,
    labelKey: "tournaments.circuits.cadence.monthly",
  },
} as const;

export type TournamentCircuitCadence =
  (typeof TournamentCircuitCadence)[keyof typeof TournamentCircuitCadence]["value"];
