export const TournamentDiscordRole = {
  PARTICIPANT: { name: "PARTICIPANT", value: "participant", placementRank: null },
  CHAMPION: { name: "CHAMPION", value: "champion", placementRank: 1 },
  TOP_FOUR: { name: "TOP_FOUR", value: "top_four", placementRank: 2 },
  TOP_EIGHT: { name: "TOP_EIGHT", value: "top_eight", placementRank: 3 },
} as const;

export type TournamentDiscordRole = (typeof TournamentDiscordRole)[keyof typeof TournamentDiscordRole]["value"];
