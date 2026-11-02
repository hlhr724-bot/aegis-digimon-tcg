import { getCardTranslationCache } from "@/i18n/getCardTranslationCache";
import type { CardTranslationData } from "@/i18n/cardTranslationTypes";
import type { Locale } from "@/i18n/locales";

async function loadBundle(locale: Locale): Promise<CardTranslationData> {
  if (locale === "ja") {
    const [names, meta] = await Promise.all([import("@/i18n/cardNames.ja.json"), import("@/i18n/cardMeta.ja.json")]);
    return { names: names.default, meta: meta.default, text: {}, keywords: {}, reminders: {} };
  }
  if (locale === "ko") {
    const [names, meta] = await Promise.all([import("@/i18n/cardNames.ko.json"), import("@/i18n/cardMeta.ko.json")]);
    return { names: names.default, meta: meta.default, text: {}, keywords: {}, reminders: {} };
  }
  const { cardTranslationData } = await import("@/i18n/cardTranslationBundle");
  return cardTranslationData;
}

export function loadCardTranslations(locale: Locale = "zh-CN"): Promise<CardTranslationData> {
  const cache = getCardTranslationCache(locale);
  if (!cache) {
    return Promise.reject(new Error(`No card translations for ${locale}`));
  }
  if (!cache.pending) {
    cache.pending = loadBundle(locale)
      .then((data) => {
        cache.data = data;
        return data;
      })
      .catch((error: unknown) => {
        cache.pending = undefined;
        throw error;
      });
  }
  return cache.pending;
}
