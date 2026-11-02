import { useContext } from "react";
import { CardImageLanguage } from "@aegis/shared/cards/CardImageLanguage";
import { resolveViewerCardArtId } from "@/screens/cardLanguage/resolveViewerCardArtId";
import { useCardImageLanguage } from "@/screens/cardLanguage/useCardImageLanguage";
import { ViewerCardArtIdsContext } from "@/screens/cardLanguage/ViewerCardArtIdsContext";

type Params = { cardId: string | undefined; artId: string | undefined };

export function useViewerCardArtId({ cardId, artId }: Params): string | undefined {
  const viewerArtIds = useContext(ViewerCardArtIdsContext);
  const language = useCardImageLanguage() ?? CardImageLanguage.ENGLISH.value;
  if (!viewerArtIds || !cardId) {
    return artId;
  }
  return resolveViewerCardArtId({ cardId, artId, language, viewerArtIds });
}
