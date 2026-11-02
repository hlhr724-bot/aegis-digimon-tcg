export const TournamentCatalogTab = {
  EXPLORE: { name: "EXPLORE", value: "explore", labelKey: "tournaments.catalog.explore" },
  MINE: { name: "MINE", value: "mine", labelKey: "tournaments.catalog.mine" },
  CIRCUITS: { name: "CIRCUITS", value: "circuits", labelKey: "tournaments.circuits.title" },
} as const;

export type TournamentCatalogTab = (typeof TournamentCatalogTab)[keyof typeof TournamentCatalogTab]["value"];
