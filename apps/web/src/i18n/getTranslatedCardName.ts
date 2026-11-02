import { getDictionaryValue } from "@/i18n/getDictionaryValue";
import type { CardTranslationData } from "@/i18n/cardTranslationTypes";

type Params = { name: string; translations?: CardTranslationData };

export function getTranslatedCardName({ name, translations }: Params): string {
  const translated = getDictionaryValue({ dictionary: translations?.names, key: name }) || name;
  if (!/(?:ACE|ＡＣＥ)\s*$/iu.test(name)) {
    return translated.replace(/\s*(?:ACE|ＡＣＥ)\s*$/iu, "");
  }
  return translated;
}
