import type { MatchupGameCount } from "@aegis/shared/deckSimulation/MATCHUP_GAME_COUNTS";
import type { Decklist } from "#api/engine/setup";

export type MatchupRequest = {
  deck: Decklist;
  opponent: Decklist;
  opponentName: string;
  games: MatchupGameCount;
};
