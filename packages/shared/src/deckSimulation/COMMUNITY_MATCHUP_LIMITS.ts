export const COMMUNITY_MATCHUP_LIMITS = {
  maxOpponents: 5,
  defaultOpponents: 5,
  gamesPerOpponent: [4, 8],
} as const;

export type CommunityGamesPerOpponent = (typeof COMMUNITY_MATCHUP_LIMITS.gamesPerOpponent)[number];
