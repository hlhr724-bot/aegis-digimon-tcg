import type { TournamentStatus } from "@aegis/shared/tournaments/index";

export const HomeTournamentFilter = {
  ALL: {
    name: "ALL",
    value: "all",
    labelKey: "home.tournaments.filter.all",
    statuses: ["registration", "check_in", "running"],
  },
  OPEN: {
    name: "OPEN",
    value: "open",
    labelKey: "home.tournaments.filter.open",
    statuses: ["registration", "check_in"],
  },
  RUNNING: {
    name: "RUNNING",
    value: "running",
    labelKey: "home.tournaments.filter.running",
    statuses: ["running"],
  },
} as const satisfies Record<
  string,
  { name: string; value: string; labelKey: string; statuses: readonly TournamentStatus[] }
>;

export type HomeTournamentFilter = (typeof HomeTournamentFilter)[keyof typeof HomeTournamentFilter]["value"];
