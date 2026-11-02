import storyTextPt from "@/i18n/storyText.pt-BR.json";
import { getDictionaryValue } from "@/i18n/getDictionaryValue";
import type { Locale } from "@/i18n/locales";
import storyTextZh from "@/i18n/storyText.zh.json";

type Params = { text: string; locale: Locale };

export function getTranslatedStoryText({ text, locale }: Params): string {
  if (locale === "pt-BR") {
    return getDictionaryValue({ dictionary: storyTextPt, key: text }) || text;
  }
  if (locale !== "zh-CN") {
    return text;
  }
  return getDictionaryValue({ dictionary: storyTextZh, key: text }) || text;
}
