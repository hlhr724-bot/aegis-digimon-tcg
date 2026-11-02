export const TournamentCategory = {
  COMMUNITY: { name: "COMMUNITY", value: "community", labelKey: "tournaments.category.community" },
  OFFICIAL: { name: "OFFICIAL", value: "official", labelKey: "tournaments.category.official" },
} as const;

export type TournamentCategory = (typeof TournamentCategory)[keyof typeof TournamentCategory]["value"];
