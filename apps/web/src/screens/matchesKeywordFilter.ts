import { type CardDefinition } from "@aegis/shared/cards/types";
import { findCardKeywords } from "@/screens/findCardKeywords";
import { type KeywordFilter } from "@/screens/KeywordFilter";

type MatchesKeywordFilterParams = {
  card: CardDefinition;
  selectedKeywords: readonly KeywordFilter[];
};

export function matchesKeywordFilter({ card, selectedKeywords }: MatchesKeywordFilterParams): boolean {
  if (selectedKeywords.length === 0) {
    return true;
  }
  const keywords = findCardKeywords(card);
  return selectedKeywords.some((keyword) => keywords.has(keyword));
}
