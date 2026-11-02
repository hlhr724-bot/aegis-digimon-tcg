import { useEffect } from "react";
import type { CardTextField } from "@/i18n/CardTextField";
import { CardTextStatus } from "@/i18n/CardTextStatus";
import { useCardTranslationState } from "@/i18n/useCardTranslationState";
import { resolveCardText } from "@/i18n/resolveCardText";
import { cardTextTranslationDiagnostics } from "@/i18n/cardTextTranslationDiagnostics";
import { normalizePrintedTextKey } from "@/i18n/normalizePrintedTextKey";

type Params = {
  text: string;
  cardId?: string;
  field?: CardTextField;
  surface?: string;
  allowContext?: boolean;
  timing?: string;
};

export function useResolvedCardText(params: Params) {
  const state = useCardTranslationState({ includePrintedText: true });
  const result = resolveCardText({
    ...params,
    translations: state.data,
    locale: state.locale,
    loadingStatus: state.status,
  });
  const { text, cardId, field, surface, timing } = params;
  const { status, reason } = result;
  useEffect(() => {
    if (state.locale === "en" || status === CardTextStatus.PENDING.value) {
      return;
    }
    const key = JSON.stringify([state.locale, cardId, field, surface, timing, normalizePrintedTextKey(text)]);
    if (status === CardTextStatus.COMPLETE.value) {
      cardTextTranslationDiagnostics.delete(key);
      return;
    }
    const previous = cardTextTranslationDiagnostics.get(key);
    if (!previous && cardTextTranslationDiagnostics.size >= 200) {
      cardTextTranslationDiagnostics.delete(cardTextTranslationDiagnostics.keys().next().value!);
    }
    cardTextTranslationDiagnostics.set(key, {
      cardId,
      field,
      surface,
      timing,
      locale: state.locale,
      text,
      result,
      count: (previous?.count ?? 0) + 1,
    });
  }, [state.locale, text, cardId, field, surface, timing, status, reason, result.text, result.source]);
  return { ...result, retry: state.retry };
}
