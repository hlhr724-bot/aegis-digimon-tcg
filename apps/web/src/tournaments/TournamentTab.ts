export const TournamentTab = {
  OVERVIEW: { name: "OVERVIEW", value: "overview", organizerOnly: false },
  BRACKET: { name: "BRACKET", value: "bracket", organizerOnly: false },
  PLAYERS: { name: "PLAYERS", value: "players", organizerOnly: false },
  RULES: { name: "RULES", value: "rules", organizerOnly: false },
  ORGANIZE: { name: "ORGANIZE", value: "organize", organizerOnly: true },
} as const;
export type TournamentTab = (typeof TournamentTab)[keyof typeof TournamentTab]["value"];
