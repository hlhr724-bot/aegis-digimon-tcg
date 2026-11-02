import type { CardDefinition } from "@aegis/shared/cards/types";
import { cardSearchMatch, type CardSort } from "@/screens/cardFilters";
import { sortCards } from "@/screens/cardSorting";

type Params = {
  cards: readonly CardDefinition[];
  sort: CardSort;
  query: string;
};

export function sortSearchResults({ cards, sort, query }: Params): CardDefinition[] {
  if (sort !== "name") {
    return sortCards(cards, sort);
  }
  const nameMatches = cards.filter((card) => cardSearchMatch(card, query) === "name");
  const textMatches = cards.filter((card) => cardSearchMatch(card, query) === "text");
  return [...sortCards(nameMatches, sort), ...sortCards(textMatches, sort)];
}
