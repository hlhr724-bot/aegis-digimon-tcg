const CARD_IMAGE_BASE = "/assets/card-images";

const CARD_IMAGE_CACHE_VERSION = "2026-10-30";

export function mirroredCardImageUrl(imageName: string): string {
  return `${CARD_IMAGE_BASE}/${imageName}.webp?v=${CARD_IMAGE_CACHE_VERSION}`;
}
