import type { CardTranslationData } from "@/i18n/cardTranslationTypes";
import { getDictionaryValue } from "@/i18n/getDictionaryValue";
import { keywordBaseName } from "@/game/keywordReminders";

type Params = { keyword: string; translations?: CardTranslationData };

export function resolveTranslatedKeyword({ keyword, translations }: Params) {
  const plain = keyword.replace(/^[<＜]|[>＞]$/g, "").trim();
  const reverseEntry = Object.entries(translations?.keywords ?? {}).find(([, value]) => value === plain);
  const parsed = reverseEntry?.[0] ?? plain;
  const parameterStart = parsed.search(/[+-]?\d|[（(〈<]/);
  const name = parameterStart < 0 ? parsed.trim() : parsed.slice(0, parameterStart).trim();
  const suffix = parameterStart < 0 ? "" : parsed.slice(parameterStart).trim();
  let base = keywordBaseName(name);
  let translatedName = getDictionaryValue({ dictionary: translations?.reminders, key: base })?.zhName;
  if (translations && !translatedName) {
    const reminder = Object.entries(translations.reminders).find(([, entry]) => entry.zhName === name);
    if (reminder) {
      base = reminder[0];
      translatedName = reminder[1].zhName;
    } else {
      const entry = Object.entries(translations.keywords).find(
        ([key]) => !/[\d(]/.test(key) && keywordBaseName(key) === base,
      );
      translatedName = entry?.[1];
    }
  }
  const reminderKeyword = /^[+-]?\d+$/.test(suffix) ? `${base} ${suffix}` : base;
  if (!translatedName) {
    return { label: keyword, base, reminderKeyword };
  }
  let label = `${translatedName}${suffix}`;
  if (/^[+-]?\d+$/.test(suffix)) {
    const exact = getDictionaryValue({ dictionary: translations?.keywords, key: parsed.replace(/\s+/g, "") });
    label = exact || label;
  }
  if (keyword.startsWith("＜")) {
    label = `＜${label}＞`;
  } else if (keyword.startsWith("<")) {
    label = `<${label}>`;
  }
  return { label, base, reminderKeyword };
}
