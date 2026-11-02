type DeckCounts = readonly (readonly [string, number])[];

type Params = { base: DeckCounts; featured: DeckCounts };

const mainDeckSize = 50;

export function buildDrillDeckCounts({ base, featured }: Params): DeckCounts {
  const featuredIds = new Set(featured.map(([card]) => card));
  const counts = [...featured, ...base.filter(([card]) => !featuredIds.has(card))].map(
    ([card, count]): [string, number] => [card, count],
  );
  let excess = counts.reduce((total, [, count]) => total + count, 0) - mainDeckSize;
  for (let index = counts.length - 1; excess > 0 && index >= featured.length; index -= 1) {
    const entry = counts[index]!;
    const removed = Math.min(excess, entry[1]);
    entry[1] -= removed;
    excess -= removed;
  }
  return counts.filter(([, count]) => count > 0);
}
