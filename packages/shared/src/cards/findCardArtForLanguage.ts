import { CardImageLanguage } from "#shared/cards/CardImageLanguage";
import { getCardArts } from "#shared/cards/arts";
import { artRegionOf } from "#shared/cards/artRegionOf";

type Params = { cardId: string; language: CardImageLanguage | undefined };

export function findCardArtForLanguage({ cardId, language }: Params) {
  return getCardArts(cardId).find(
    (art) => (artRegionOf(art.artId)?.value ?? CardImageLanguage.ENGLISH.value) === language,
  );
}
