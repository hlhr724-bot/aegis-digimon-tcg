import type { UsedDeck } from "#shared/decks/UsedDeck";

export interface DeckHistoryDetails {
  deck: UsedDeck;
  coverCardId?: string;
  cardsChangedAt: number;
}
