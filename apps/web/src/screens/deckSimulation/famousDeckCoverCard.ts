import type { FamousDeck } from "@aegis/shared";

export function famousDeckCoverCard(deck: FamousDeck): string | undefined {
  return [...new Set(deck.decklist.mainDeck)].at(-1);
}
