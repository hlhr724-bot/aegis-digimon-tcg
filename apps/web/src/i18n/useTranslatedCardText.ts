import { resolveCardText } from "@/i18n/resolveCardText";
import { useCardTranslationState } from "@/i18n/useCardTranslationState";
import type { CardTextField } from "@/i18n/CardTextField";

type Params = { text: string; cardId?: string; field?: CardTextField };

export function useTranslatedCardText() {
  const state = useCardTranslationState({ includePrintedText: true });
  return function translateCardText(params: Params): string {
    return resolveCardText({
      ...params,
      translations: state.data,
      locale: state.locale,
      loadingStatus: state.status,
      allowContext: true,
    }).text;
  };
}
