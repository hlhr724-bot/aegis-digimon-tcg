import type { DeckListing } from "@/game/decks";
import { isBetaCard } from "@/screens/isBetaCard";

export function deckHasBetaCards(deck: Pick<DeckListing, "mainDeck" | "eggDeck">): boolean {
  return [...deck.mainDeck, ...deck.eggDeck].some(isBetaCard);
}
