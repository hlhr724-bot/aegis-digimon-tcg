/** Optional casual/private match clock policy. Public queues always use the defaults. */
export const MATCH_TIMER_START_SECONDS = 300;
export const MATCH_TIMER_REFILL_SECONDS = 60;
export const MATCH_TIMER_OPPONENT_REFILL_SECONDS = 30;
export const MATCH_TIMER_START_OPTIONS = [60, 180, 300, 600] as const;
export const MATCH_TIMER_REFILL_OPTIONS = [0, 15, 30, 60] as const;
/**
 * Each player's own mulligan window. It never draws on the match clock; when it runs out,
 * the server keeps the hand.
 */
export const MULLIGAN_TIMER_SECONDS = 30;
/**
 * Combo time: each decision an effect asks of a player (trigger order, targets, selections,
 * optional "activate?" choices), confirmed play or digivolution adds this much to that player's clock.
 */
export const MATCH_TIMER_DECISION_BONUS_SECONDS = 3;
/** The most combo time one player can gain in a single turn. */
export const MATCH_TIMER_DECISION_BONUS_MAX_SECONDS_PER_TURN = 30;
export interface MatchTimerOptions {
  matchTimer: boolean;
  timerStartSeconds?: number;
  /** Legacy join field; turn bonuses are fixed at 60s for the owner and 30s for the opponent. */
  timerRefillSeconds?: number;
}
export function matchTimerSettings(options: Partial<MatchTimerOptions>, privateRoom = false) {
  return {
    enabled: options.matchTimer === true,
    startSeconds:
      privateRoom && MATCH_TIMER_START_OPTIONS.includes(options.timerStartSeconds as 300)
        ? options.timerStartSeconds!
        : MATCH_TIMER_START_SECONDS,
    refillSeconds: MATCH_TIMER_REFILL_SECONDS,
  };
}
