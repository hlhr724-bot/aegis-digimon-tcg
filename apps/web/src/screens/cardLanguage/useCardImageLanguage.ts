import { useSyncExternalStore } from "react";
import { cardImageLanguageStore } from "@/screens/cardLanguage/cardImageLanguageStore";
import { getCardImageLanguage } from "@/screens/cardLanguage/getCardImageLanguage";

function subscribeCardImageLanguage(listener: () => void) {
  cardImageLanguageStore.listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    cardImageLanguageStore.listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function useCardImageLanguage() {
  return useSyncExternalStore(subscribeCardImageLanguage, getCardImageLanguage, () => undefined);
}
