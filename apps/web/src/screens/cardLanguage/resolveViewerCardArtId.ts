import { artRegionOf } from "@aegis/shared/cards/artRegionOf";
import { resolveCardArt } from "@aegis/shared/cards/arts";
import { CardImageLanguage } from "@aegis/shared/cards/CardImageLanguage";
import { findCardArtForLanguage } from "@aegis/shared/cards/findCardArtForLanguage";

type Params = {
  cardId: string;
  artId: string | undefined;
  language: CardImageLanguage;
  viewerArtIds: ReadonlySet<string>;
};

export function resolveViewerCardArtId({ cardId, artId, language, viewerArtIds }: Params): string {
  const shownArtId = resolveCardArt(cardId, artId).artId;
  const shownLanguage = artRegionOf(shownArtId)?.value ?? CardImageLanguage.ENGLISH.value;
  if (viewerArtIds.has(shownArtId) || shownLanguage === language) {
    return shownArtId;
  }
  return findCardArtForLanguage({ cardId, language })?.artId ?? cardId;
}
