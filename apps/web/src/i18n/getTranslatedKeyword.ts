import type { CardTranslationData } from "@/i18n/cardTranslationTypes";
import { resolveTranslatedKeyword } from "@/i18n/resolveTranslatedKeyword";

type Params = { keyword: string; translations?: CardTranslationData };

export function getTranslatedKeyword({ keyword, translations }: Params): string {
  return resolveTranslatedKeyword({ keyword, translations }).label;
}
