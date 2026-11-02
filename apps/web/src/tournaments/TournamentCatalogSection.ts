import { TournamentCategory } from "@aegis/shared/tournaments/TournamentCategory";

export const TournamentCatalogSection = {
  OFFICIAL: {
    name: "OFFICIAL",
    value: TournamentCategory.OFFICIAL.value,
    headingKey: "tournaments.catalog.section.official",
    helpLabelKey: "tournaments.category.officialHelpLabel",
    explanationKey: "tournaments.category.officialExplained",
  },
  COMMUNITY: {
    name: "COMMUNITY",
    value: TournamentCategory.COMMUNITY.value,
    headingKey: "tournaments.catalog.section.community",
    helpLabelKey: "tournaments.category.communityHelpLabel",
    explanationKey: "tournaments.category.communityExplained",
  },
} as const;

export type TournamentCatalogSection =
  (typeof TournamentCatalogSection)[keyof typeof TournamentCatalogSection]["value"];
