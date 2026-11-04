export const MatchupOpponentSource = {
  COMMUNITY: { name: "COMMUNITY", value: "community" },
  FAMOUS: { name: "FAMOUS", value: "famous" },
  MIRROR: { name: "MIRROR", value: "mirror" },
} as const;

export type MatchupOpponentSource = (typeof MatchupOpponentSource)[keyof typeof MatchupOpponentSource]["value"];
