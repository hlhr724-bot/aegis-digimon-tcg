import { useMemo } from "react";
import { cardImageUrls } from "@aegis/shared/cards/images";
import { useTokenArt } from "@/design/tokenArt/useTokenArt";
import { useViewerCardArtId } from "@/screens/cardLanguage/useViewerCardArtId";

type Params = { cardId: string | undefined; artId?: string };

export function useCardImageUrls({ cardId, artId }: Params): string[] {
  const custom = useTokenArt(cardId);
  const shownArtId = useViewerCardArtId({ cardId, artId });
  return useMemo(() => {
    const defaults = cardImageUrls(cardId, shownArtId);
    return custom ? [custom, ...defaults] : defaults;
  }, [cardId, shownArtId, custom]);
}
