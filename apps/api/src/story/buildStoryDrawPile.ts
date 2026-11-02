type Params = {
  counts: readonly (readonly [string, number])[];
  placed: readonly string[];
  opening?: readonly string[];
  substitutions?: readonly (readonly [string, string, number])[];
};

export function buildStoryDrawPile({ counts, placed, opening = [], substitutions = [] }: Params): string[] {
  const cards = counts.flatMap(([card, count]) => Array.from({ length: count }, () => card));
  for (const [removed, added, count] of substitutions) {
    for (let copy = 0; copy < count; copy++) {
      const index = cards.indexOf(removed);
      if (index < 0) {
        throw new Error(`Missing substitution in story deck: ${removed}`);
      }
      cards[index] = added;
    }
  }
  for (const card of [...placed, ...opening]) {
    const index = cards.indexOf(card);
    if (index < 0) {
      throw new Error(`Missing card in story deck: ${card}`);
    }
    cards.splice(index, 1);
  }
  return [...opening, ...cards];
}
