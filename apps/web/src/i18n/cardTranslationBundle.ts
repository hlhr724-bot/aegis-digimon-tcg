import names from "@/i18n/cardNames.zh.json";
import keywords from "@/i18n/cardKeywords.zh.json";
import reminders from "@/i18n/keywordReminders.zh.json";
import meta from "@/i18n/cardMeta.zh.json";
import type { CardTranslationData } from "@/i18n/cardTranslationTypes";

export const cardTranslationData: CardTranslationData = {
  names,
  text: {},
  keywords,
  reminders: reminders.reminders,
  meta,
};
