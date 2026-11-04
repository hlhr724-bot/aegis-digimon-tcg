import type { DeckFormat } from "@aegis/shared/deckFormat";
import type { Decklist } from "#api/engine/setup";
import type { MatchupOpponentSpec } from "#api/deckSimulation/MatchupOpponentSpec";

export type MatchupRequestDraft = {
  deck: Decklist;
  format: DeckFormat | undefined;
  gamesPerOpponent: number;
  opponent: MatchupOpponentSpec;
  deckId?: string;
};
