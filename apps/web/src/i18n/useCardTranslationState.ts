import { useContext, useEffect, useState } from "react";
import { I18nContext } from "@/i18n/I18nContext";
import { CardTextStatus } from "@/i18n/CardTextStatus";
import { getCardTranslationCache } from "@/i18n/getCardTranslationCache";
import { loadCardTranslations } from "@/i18n/loadCardTranslations";
import { loadPrintedCardTranslations } from "@/i18n/loadPrintedCardTranslations";
import type { Locale } from "@/i18n/locales";
import type { CardTranslationData } from "@/i18n/cardTranslationTypes";

type Params = { includePrintedText?: boolean; locale?: Locale };
type Loaded = { locale: Locale; printed: boolean; data?: CardTranslationData; error?: unknown };

export function useCardTranslationState({ includePrintedText = false, locale }: Params = {}) {
  const context = useContext(I18nContext);
  const effectiveLocale = locale ?? context?.locale ?? "en";
  const cache = getCardTranslationCache(effectiveLocale);
  const [loaded, setLoaded] = useState<Loaded>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!cache) {
      return;
    }
    let cancelled = false;
    const load = includePrintedText ? loadPrintedCardTranslations : loadCardTranslations;
    void load(effectiveLocale)
      .then((data) => {
        if (!cancelled) {
          setLoaded({ locale: effectiveLocale, printed: includePrintedText, data });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoaded({ locale: effectiveLocale, printed: includePrintedText, error });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cache, effectiveLocale, includePrintedText, attempt]);
  const current = loaded?.locale === effectiveLocale && loaded.printed === includePrintedText ? loaded : undefined;
  const data = current?.data ?? (includePrintedText ? cache?.printedData : cache?.data);
  let status: CardTextStatus = CardTextStatus.COMPLETE.value;
  if (cache && !data) {
    status = current?.error ? CardTextStatus.ERROR.value : CardTextStatus.PENDING.value;
  }
  return {
    data,
    status,
    error: current?.error,
    locale: effectiveLocale,
    retry: () => {
      setLoaded(undefined);
      setAttempt((value) => value + 1);
    },
  };
}
