import type { TournamentStatus } from "@aegis/shared/tournaments/index";

export const TournamentCatalogFilter = {
  UPCOMING: {
    name: "UPCOMING",
    value: "upcoming",
    labelKey: "tournaments.catalog.upcoming",
    statuses: ["draft", "registration", "check_in", "running"],
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
  FINISHED: {
    name: "FINISHED",
    value: "finished",
    labelKey: "tournaments.catalog.finished",
    statuses: ["finished", "cancelled"],
  },
} as const satisfies Record<
  string,
  { name: string; value: string; labelKey: string; statuses: readonly TournamentStatus[] }
>;

export type TournamentCatalogFilter = (typeof TournamentCatalogFilter)[keyof typeof TournamentCatalogFilter]["value"];
