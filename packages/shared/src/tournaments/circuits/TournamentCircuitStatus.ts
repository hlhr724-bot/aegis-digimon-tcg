export const TournamentCircuitStatus = {
  ACTIVE: {
    name: "ACTIVE",
    value: "active",
    isClosed: false,
    labelKey: "tournaments.circuits.status.active",
  },
  FINISHED: {
    name: "FINISHED",
    value: "finished",
    isClosed: true,
    labelKey: "tournaments.circuits.status.finished",
  },
  CANCELLED: {
    name: "CANCELLED",
    value: "cancelled",
    isClosed: true,
    labelKey: "tournaments.circuits.status.cancelled",
  },
} as const;

export type TournamentCircuitStatus = (typeof TournamentCircuitStatus)[keyof typeof TournamentCircuitStatus]["value"];
