export const MATCHUP_GAME_COUNTS = [10, 20, 40] as const;

export type MatchupGameCount = (typeof MATCHUP_GAME_COUNTS)[number];
