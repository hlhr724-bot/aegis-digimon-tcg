import { getKeywordName } from "@/game/getKeywordName";
import { KEYWORD_GLOSSARY } from "@/game/keywordGlossary";

export const SECURITY_ATTACK_KEYWORD = "SecurityAttack";

export const SECURITY_ATTACK_PLUS_FILTER = "SecurityAttackPlus";

export const SECURITY_ATTACK_MINUS_FILTER = "SecurityAttackMinus";

export type KeywordFilter = string;

export type KeywordFilterOption = {
  value: KeywordFilter;
  label: string;
};

function buildKeywordFilterOptions(key: string): KeywordFilterOption[] {
  const name = getKeywordName(key);
  if (key === SECURITY_ATTACK_KEYWORD) {
    return [
      { value: SECURITY_ATTACK_PLUS_FILTER, label: `${name} +` },
      { value: SECURITY_ATTACK_MINUS_FILTER, label: `${name} -` },
    ];
  }
  return [{ value: key, label: name }];
}

export const KEYWORD_FILTERS: readonly KeywordFilterOption[] = Object.keys(KEYWORD_GLOSSARY)
  .flatMap(buildKeywordFilterOptions)
  .sort((left, right) => left.label.localeCompare(right.label));
