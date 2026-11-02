import type { TournamentRules } from "@aegis/shared/tournaments/index";

type Params = { bestOf: 1 | 3 };
const MINUTE_MS = 60_000;
const MANUAL_TIEBREAKERS = [
  "points",
  "match_win_rate",
  "opponent_match_win_rate",
  "head_to_head",
  "judge_random_draw",
] as const;

const MANUAL_STANDINGS: TournamentRules["standings"] = {
  winPoints: 3,
  drawPoints: 1,
  lossPoints: 0,
  byePoints: 3,
  tiebreakers: MANUAL_TIEBREAKERS,

  winRateFloor: 0.33,
};

const MANUAL_STATE_TIEBREAKERS = [
  "more_security",
  "more_deck_cards_excluding_digi_egg",
  "more_digimon_in_battle_area",
  "last_security_removal",
] as const;

const MANUAL_TIMEOUT: TournamentRules["timeout"] = {
  swiss: "extra_turns_then_draw",
  elimination: "extra_turns_then_state_tiebreak",
  swissExtraTurns: 3,
  eliminationExtraTurns: 5,
  stateTiebreakers: MANUAL_STATE_TIEBREAKERS,
};

const MANUAL_ATTENDANCE: TournamentRules["attendance"] = {
  joinGraceMs: 5 * MINUTE_MS,
  gameLossAtMs: 5 * MINUTE_MS,
  matchLossAtMs: 10 * MINUTE_MS,
};

export function buildTournamentRules({ bestOf }: Params): TournamentRules {
  return {
    match: {
      winsRequired: bestOf === 1 ? 1 : 2,
      swissDurationMs: (bestOf === 1 ? 25 : 45) * MINUTE_MS,
      topCutDurationMs: (bestOf === 1 ? 25 : 55) * MINUTE_MS,
      finalDurationMs: bestOf === 1 ? 25 * MINUTE_MS : null,
      overtimeMs: 5 * MINUTE_MS,
    },
    attendance: { ...MANUAL_ATTENDANCE },
    timeout: { ...MANUAL_TIMEOUT, stateTiebreakers: [...MANUAL_STATE_TIEBREAKERS] },
    standings: { ...MANUAL_STANDINGS, tiebreakers: [...MANUAL_TIEBREAKERS] },
  };
}
