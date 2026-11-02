import { makeRng, shuffleInPlace } from "#api/engine/setup";
import type { BeliefDeck } from "#api/bot/evolution/BeliefDeck";

type Params = {
  catalog: readonly BeliefDeck[];
  observedMainCards: readonly string[];
  observedEggCards: readonly string[];
  seenMainCards?: readonly string[];
  seenEggCards?: readonly string[];
  mainCardCount: number;
  eggCardCount: number;
  seed: number;
};

type SampledBeliefDeck = {
  id: string;
  archetype: string;
  mainDeck: string[];
  eggDeck: string[];
};

function countCards(cards: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of cards) counts.set(card, (counts.get(card) ?? 0) + 1);
  return counts;
}

const catalogDeckCounts = new WeakMap<BeliefDeck, { main: Map<string, number>; eggs: Map<string, number> }>();

function countDeckCards(deck: BeliefDeck): { main: Map<string, number>; eggs: Map<string, number> } {
  let counts = catalogDeckCounts.get(deck);
  if (counts === undefined) {
    counts = { main: countCards(deck.mainDeck), eggs: countCards(deck.eggDeck) };
    catalogDeckCounts.set(deck, counts);
  }
  return counts;
}

function removeKnownCards(cards: readonly string[], observed: readonly string[]): string[] {
  const remaining = [...cards];
  for (const [card, count] of countCards(observed)) {
    for (let copy = 0; copy < count; copy++) {
      const index = remaining.indexOf(card);
      if (index < 0) break;
      remaining.splice(index, 1);
    }
  }
  return remaining;
}

function fillUnknownSlots({
  cards,
  source,
  count,
  random,
}: {
  cards: readonly string[];
  source: readonly string[];
  count: number;
  random: () => number;
}): string[] {
  if (count === 0) return [];
  if (source.length === 0) throw new Error("Belief deck has no cards for an unknown zone");
  const result = shuffleInPlace([...cards], random);
  for (let index = 0; result.length < count; index++) result.push(source[index % source.length]!);
  shuffleInPlace(result, random);
  return result.slice(0, count);
}

export function sampleBeliefDeck({
  catalog,
  observedMainCards,
  observedEggCards,
  seenMainCards = [],
  seenEggCards = [],
  mainCardCount,
  eggCardCount,
  seed,
}: Params): SampledBeliefDeck {
  if (
    catalog.length === 0 ||
    !Number.isSafeInteger(mainCardCount) ||
    mainCardCount < 0 ||
    !Number.isSafeInteger(eggCardCount) ||
    eggCardCount < 0
  ) {
    throw new Error("Invalid archetype belief sample request");
  }
  const mainCounts = countCards([...observedMainCards, ...seenMainCards]);
  const eggCounts = countCards([...observedEggCards, ...seenEggCards]);
  const weighted = catalog.map((deck) => {
    let score = Math.log(Math.max(deck.weight, Number.MIN_VALUE));
    const { main: deckMainCounts, eggs: deckEggCounts } = countDeckCards(deck);
    for (const [card, count] of mainCounts) {
      const available = deckMainCounts.get(card) ?? 0;
      score += Math.min(available, count) * 3 - Math.max(0, count - available) * 5;
    }
    for (const [card, count] of eggCounts) {
      const available = deckEggCounts.get(card) ?? 0;
      score += Math.min(available, count) * 3 - Math.max(0, count - available) * 5;
    }
    return { deck, score };
  });
  const maximum = Math.max(...weighted.map((entry) => entry.score));
  const probabilities = weighted.map((entry) => Math.exp(entry.score - maximum));
  const total = probabilities.reduce((sum, value) => sum + value, 0);
  const random = makeRng(seed);
  let threshold = random() * total;
  let selected = weighted.at(-1)!.deck;
  for (let index = 0; index < weighted.length; index++) {
    threshold -= probabilities[index]!;
    if (threshold <= 0) {
      selected = weighted[index]!.deck;
      break;
    }
  }
  const mainDeck = fillUnknownSlots({
    cards: removeKnownCards(selected.mainDeck, observedMainCards),
    source: selected.mainDeck,
    count: mainCardCount,
    random,
  });
  const eggDeck = fillUnknownSlots({
    cards: removeKnownCards(selected.eggDeck, observedEggCards),
    source: selected.eggDeck,
    count: eggCardCount,
    random,
  });
  return { id: selected.id, archetype: selected.archetype, mainDeck, eggDeck };
}
