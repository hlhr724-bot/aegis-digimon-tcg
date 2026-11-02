import { findCardArtForLanguage } from "@aegis/shared/cards/findCardArtForLanguage";
import { artRegionOf } from "@aegis/shared/cards/artRegionOf";
import { resolveCardArt } from "@aegis/shared/cards/arts";
import type { DeckListing } from "@/game/decks";
import { CardImageLanguage } from "@aegis/shared/cards/CardImageLanguage";

type Params = { deck: DeckListing; language: CardImageLanguage };

export function convertDeckCardLanguage({ deck, language }: Params) {
  let unavailable = 0;
  let changed = false;
  function convertCards(cards: readonly string[], arts: readonly string[] | undefined) {
    return cards.map((cardId, index) => {
      const current = arts?.[index] ?? cardId;
      const shownArtId = resolveCardArt(cardId, current).artId;
      if ((artRegionOf(shownArtId)?.value ?? CardImageLanguage.ENGLISH.value) === language) {
        return current;
      }
      const printing = findCardArtForLanguage({ cardId, language });
      if (!printing) {
        unavailable += 1;
        return current;
      }
      if (printing.artId !== current) {
        changed = true;
      }
      return printing.artId;
    });
  }
  const mainDeckArts = convertCards(deck.mainDeck, deck.mainDeckArts);
  const eggDeckArts = convertCards(deck.eggDeck, deck.eggDeckArts);
  return { deck: changed ? { ...deck, mainDeckArts, eggDeckArts } : deck, unavailable, changed };
}
