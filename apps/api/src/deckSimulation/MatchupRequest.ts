import type { Decklist } from "#api/engine/setup";
import type { MatchupOpponent } from "#api/deckSimulation/MatchupOpponent";

export type MatchupRequest = {
  deck: Decklist;
  opponents: readonly MatchupOpponent[];
  gamesPerOpponent: number;
  deckId?: string;
};
