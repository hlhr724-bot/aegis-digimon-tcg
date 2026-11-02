import { getDictionaryValue } from "@/i18n/getDictionaryValue";
import type { CardTranslationData } from "@/i18n/cardTranslationTypes";
import { keywordBaseName } from "@/game/keywordReminders";

type Params = { keyword: string; fallback: string; translations?: CardTranslationData; modifier?: number };

export function getTranslatedKeywordReminder({ keyword, fallback, translations, modifier }: Params): string {
  if (!translations) {
    return fallback;
  }
  const base = keywordBaseName(keyword);
  const count = modifier || Number(/[+-]\d+/.exec(keyword)?.[0] ?? 0);
  if (base === "SecurityAttack" && count) {
    if (count > 0) {
      return `此数码宝贝进行安防判定的张数增加${count}张。`;
    }
    return `此数码宝贝进行安防判定的张数减少${Math.abs(count)}张。`;
  }
  return getDictionaryValue({ dictionary: translations.reminders, key: base })?.text || fallback;
}
