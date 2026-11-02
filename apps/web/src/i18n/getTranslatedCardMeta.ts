import { getDictionaryValue } from "@/i18n/getDictionaryValue";
import type { CardTranslationData } from "@/i18n/cardTranslationTypes";

type Params = { value: string; group: keyof CardTranslationData["meta"]; translations?: CardTranslationData };

export function getTranslatedCardMeta({ value, group, translations }: Params): string {
  return getDictionaryValue({ dictionary: translations?.meta[group], key: value }) || value;
}
