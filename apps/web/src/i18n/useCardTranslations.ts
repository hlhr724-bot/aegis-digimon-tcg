import { useCardTranslationState } from "@/i18n/useCardTranslationState";
import type { Locale } from "@/i18n/locales";

type Params = { includePrintedText?: boolean; locale?: Locale };

export function useCardTranslations(params: Params = {}) {
  return useCardTranslationState(params).data;
}
