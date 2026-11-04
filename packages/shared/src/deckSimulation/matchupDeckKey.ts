type DeckCards = { mainDeck: readonly string[]; eggDeck: readonly string[] };

export function matchupDeckKey({ mainDeck, eggDeck }: DeckCards): string {
  return `${[...mainDeck].sort().join(",")}|${[...eggDeck].sort().join(",")}`;
}
