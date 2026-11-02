import { cardTranslationCache } from "@/i18n/cardTranslationCache";
import type { Locale } from "@/i18n/locales";

const japaneseCache: typeof cardTranslationCache = {};
const koreanCache: typeof cardTranslationCache = {};

export function getCardTranslationCache(locale: Locale) {
  if (locale === "ja") {
    return japaneseCache;
  }
  if (locale === "ko") {
    return koreanCache;
  }
  if (locale === "zh-CN") {
    return cardTranslationCache;
  }
  return undefined;
}
