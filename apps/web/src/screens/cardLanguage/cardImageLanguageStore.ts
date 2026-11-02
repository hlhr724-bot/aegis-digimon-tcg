import type { CardImageLanguage } from "@aegis/shared/cards/CardImageLanguage";

export const CARD_IMAGE_LANGUAGE_STORAGE_KEY = "aegis:cardImageLanguage";
export const cardImageLanguageStore = {
  current: undefined as CardImageLanguage | undefined,
  listeners: new Set<() => void>(),
};
