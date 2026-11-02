/**
 * Casual and private rooms play a single game or a best-of-three series. Ranked, tournament and
 * bot rooms always play one game here; tournaments run their own series in `tournaments/series`.
 */
export const MATCH_BEST_OF_OPTIONS = [1, 3] as const;
export type MatchBestOf = (typeof MATCH_BEST_OF_OPTIONS)[number];

/** How long the loser of a game has to pick who goes first in the next one. */
export const SERIES_TURN_ORDER_SECONDS = 20;
export const SERIES_DECK_SELECTION_SECONDS = 90;
/** How long a seat has to arrive in the next game's room before it forfeits the series. */
export const SERIES_NEXT_GAME_JOIN_SECONDS = 60;
/** A drawn game counts for nobody, so a run of draws ends the series here instead of never. */
export const SERIES_MAX_GAMES = 5;

export interface MatchFormatOptions {
  bestOf?: MatchBestOf;
}

/** Anything a client sends that is not exactly 3 plays one game. */
export function matchBestOf(value: unknown): MatchBestOf {
  return value === 3 ? 3 : 1;
}

export function seriesWinsRequired(bestOf: MatchBestOf): number {
  return Math.ceil(bestOf / 2);
}
