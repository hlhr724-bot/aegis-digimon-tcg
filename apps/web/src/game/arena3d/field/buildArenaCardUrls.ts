import { cardImageUrls } from "@aegis/shared/cards/images";

type Params = {
  cardId: string | undefined;
  artId: string | undefined;
  faceUp: boolean;
  backUrl: string;
};

export function buildArenaCardUrls({ cardId, artId, faceUp, backUrl }: Params): readonly string[] {
  if (!faceUp || !cardId) {
    return [backUrl];
  }
  const sameOrigin = cardImageUrls(cardId, artId).filter((url) => url.startsWith("/"));
  return sameOrigin.length > 0 ? sameOrigin : [backUrl];
}
