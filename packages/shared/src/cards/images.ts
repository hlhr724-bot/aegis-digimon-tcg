import { resolveCardArt } from "./arts.js";
import { mirroredCardImageUrl } from "./mirroredCardImageUrl.js";
import { TOKEN_ID_PREFIX } from "./tokens.js";

/**
 * An errata printing's own image plus the pre-errata one, so a card whose errata art is
 * absent upstream still renders (and vice versa, since some sets ship only the errata art).
 */
function imageCandidates(imageId: string): string[] {
  const preErrata = imageId.replace(/-Errata$/, "");
  return preErrata === imageId ? [imageId] : [imageId, preErrata];
}

/**
 * Tokens are not in the upstream card image set, so their official art is bundled with the
 * client. The file name is the card id folded to ASCII, since a url is a poor place for the
 * accents and ampersands a token name can carry.
 */
function tokenImageUrl(cardId: string): string {
  const slug = cardId
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9-]/g, "-")
    .replace(/-+/g, "-");
  return `/cards/tokens/${slug}.webp`;
}

/** No urls for a card whose identity is view-gated away (undefined cardId on the client). */
export function cardImageUrls(cardId: string | undefined, artId?: string): string[] {
  if (!cardId) return [];
  if (cardId.startsWith(TOKEN_ID_PREFIX)) return [tokenImageUrl(cardId)];
  const selected = imageCandidates(resolveCardArt(cardId, artId).imageId);
  const base = imageCandidates(resolveCardArt(cardId).imageId);
  const ids = [...new Set([...selected, ...base])];
  const mirrored = ids.flatMap((id) => [mirroredCardImageUrl(id), mirroredCardImageUrl(`${id}-Sample`)]);
  return [...mirrored, `https://world.digimoncard.com/images/cardlist/card/${cardId}.png`];
}
