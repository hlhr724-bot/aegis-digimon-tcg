import type { TournamentStructure } from "#shared/tournaments/index";
import { TournamentTiebreaker } from "#shared/tournaments/TournamentTiebreaker";

export function defaultTiebreakers(structure: TournamentStructure): TournamentTiebreaker[] {
  if (structure === "round_robin") {
    return [
      TournamentTiebreaker.MATCH_WINS.value,
      TournamentTiebreaker.HEAD_TO_HEAD.value,
      TournamentTiebreaker.GAME_WIN_RATE.value,
    ];
  }
  if (structure === "swiss") {
    return [
      TournamentTiebreaker.OPPONENT_MATCH_WIN_RATE.value,
      TournamentTiebreaker.GAME_WIN_RATE.value,
      TournamentTiebreaker.OPPONENT_OPPONENT_MATCH_WIN_RATE.value,
    ];
  }
  return [];
}
