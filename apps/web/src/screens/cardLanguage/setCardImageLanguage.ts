import type { CardImageLanguage } from "@aegis/shared/cards/CardImageLanguage";
import { CARD_IMAGE_LANGUAGE_STORAGE_KEY, cardImageLanguageStore } from "@/screens/cardLanguage/cardImageLanguageStore";

export function setCardImageLanguage(language: CardImageLanguage): void {
  cardImageLanguageStore.current = language;
  try {
    localStorage.setItem(CARD_IMAGE_LANGUAGE_STORAGE_KEY, language);
  } catch {}
  for (const listener of cardImageLanguageStore.listeners) {
    listener();
  }
}
