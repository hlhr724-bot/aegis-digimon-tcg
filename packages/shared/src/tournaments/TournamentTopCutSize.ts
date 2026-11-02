export const TOURNAMENT_TOP_CUT_SIZES = [2, 4, 8, 16, 32] as const;

export type TournamentTopCutSize = (typeof TOURNAMENT_TOP_CUT_SIZES)[number];

export const MAX_SWISS_ROUNDS = 10;
