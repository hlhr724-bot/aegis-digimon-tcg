import { getCardTranslationCache } from "@/i18n/getCardTranslationCache";
import type { CardTranslationData } from "@/i18n/cardTranslationTypes";
import { loadCardTranslations } from "@/i18n/loadCardTranslations";
import type { Locale } from "@/i18n/locales";

async function loadPrintedBundle(locale: Locale) {
  if (locale === "ja") {
    const [text, byCard] = await Promise.all([
      import("@/i18n/cardText.ja.json"),
      import("@/i18n/cardTextByCard.ja.json"),
    ]);
    return { text: text.default, byCard: byCard.default };
  }
  if (locale === "ko") {
    const [text, byCard] = await Promise.all([
      import("@/i18n/cardText.ko.json"),
      import("@/i18n/cardTextByCard.ko.json"),
    ]);
    return { text: text.default, byCard: byCard.default };
  }
  const [text, runtime] = await Promise.all([
    import("@/i18n/cardText.zh.json"),
    import("@/i18n/cardText.runtime.zh.json"),
  ]);
  return { text: { ...runtime.default, ...text.default } };
}

export function loadPrintedCardTranslations(locale: Locale = "zh-CN"): Promise<CardTranslationData> {
  const cache = getCardTranslationCache(locale);
  if (!cache) {
    return Promise.reject(new Error(`No card translations for ${locale}`));
  }
  if (!cache.printedPending) {
    cache.printedPending = Promise.all([loadCardTranslations(locale), loadPrintedBundle(locale)])
      .then(([data, printed]) => {
        const translations = { ...data, ...printed };
        cache.printedData = translations;
        return translations;
      })
      .catch((error: unknown) => {
        cache.printedPending = undefined;
        throw error;
      });
  }
  return cache.printedPending;
}
