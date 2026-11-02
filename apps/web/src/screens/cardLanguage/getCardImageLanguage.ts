import { isCardImageLanguage } from "@aegis/shared/cards/isCardImageLanguage";
import { CARD_IMAGE_LANGUAGE_STORAGE_KEY, cardImageLanguageStore } from "@/screens/cardLanguage/cardImageLanguageStore";

export function getCardImageLanguage() {
  try {
    const stored = localStorage.getItem(CARD_IMAGE_LANGUAGE_STORAGE_KEY);
    return isCardImageLanguage(stored) ? stored : undefined;
  } catch {
    return cardImageLanguageStore.current;
  }
}
