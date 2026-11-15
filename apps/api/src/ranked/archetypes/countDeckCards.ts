export function countDeckCards(cards: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of cards) {
    counts.set(card, (counts.get(card) ?? 0) + 1);
  }
  return counts;
}
