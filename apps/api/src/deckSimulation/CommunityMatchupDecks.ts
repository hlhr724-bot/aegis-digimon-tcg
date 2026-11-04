import type { DeckFormat } from "@aegis/shared/deckFormat";
import type { CommunityMatchupDeck } from "#api/community/CommunityMatchupDeck";

export type CommunityMatchupDecks = {
  matchupOpponents: (params: {
    format: DeckFormat | undefined;
    deckIds: readonly string[] | undefined;
    limit: number;
  }) => Promise<CommunityMatchupDeck[]>;
};
