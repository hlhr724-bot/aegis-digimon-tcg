import { useCallback } from "react";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { getTranslatedCardName } from "@/i18n/getTranslatedCardName";
import { useCardTranslations } from "@/i18n/useCardTranslations";

export function useTranslatedCardName(): (cardId: string) => string {
  const translations = useCardTranslations();
  return useCallback(
    (cardId: string) => getTranslatedCardName({ name: getCardDefinition(cardId)?.nameEn ?? cardId, translations }),
    [translations],
  );
}
