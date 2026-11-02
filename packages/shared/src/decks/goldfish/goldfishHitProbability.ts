import { binomialCoefficient } from "#shared/decks/goldfish/binomialCoefficient";
import { OPENING_HAND_SIZE } from "#shared/rules/OPENING_HAND_SIZE";
import { SECURITY_STACK_SIZE } from "#shared/rules/SECURITY_STACK_SIZE";

type Params = {
  deckSize: number;
  groups: readonly number[];
  draws: number;
  mulligan: boolean;
};

type Opening = { probability: number; held: readonly number[] };

function enumerateOpenings(deckSize: number, groups: readonly number[]): Opening[] {
  const others = deckSize - groups.reduce((sum, copies) => sum + copies, 0);
  const total = binomialCoefficient(deckSize, OPENING_HAND_SIZE);
  const openings: Opening[] = [];
  const visit = (index: number, held: number[], ways: number, cards: number) => {
    if (index === groups.length) {
      const rest = binomialCoefficient(others, OPENING_HAND_SIZE - cards);
      if (rest > 0) openings.push({ probability: (ways * rest) / total, held: [...held] });
      return;
    }
    const copies = groups[index]!;
    for (let count = 0; count <= Math.min(copies, OPENING_HAND_SIZE - cards); count++) {
      held.push(count);
      visit(index + 1, held, ways * binomialCoefficient(copies, count), cards + count);
      held.pop();
    }
  };
  visit(0, [], 1, 0);
  return openings;
}

function coverProbability(remaining: number, missing: readonly number[], draws: number): number {
  const total = binomialCoefficient(remaining, draws);
  let probability = 0;
  for (let subset = 0; subset < 1 << missing.length; subset++) {
    let excluded = 0;
    let size = 0;
    for (let index = 0; index < missing.length; index++) {
      if ((subset & (1 << index)) !== 0) {
        excluded += missing[index]!;
        size++;
      }
    }
    probability += (size % 2 === 0 ? 1 : -1) * (binomialCoefficient(remaining - excluded, draws) / total);
  }
  return probability;
}

export function goldfishHitProbability({ deckSize, groups, draws, mulligan }: Params): number {
  if (
    !Number.isSafeInteger(deckSize) ||
    deckSize < OPENING_HAND_SIZE + SECURITY_STACK_SIZE ||
    !Number.isSafeInteger(draws) ||
    draws < 0 ||
    groups.some((copies) => !Number.isSafeInteger(copies) || copies < 1) ||
    groups.reduce((sum, copies) => sum + copies, 0) > deckSize
  ) {
    throw new Error("Invalid goldfish deck or draw count");
  }
  if (groups.length === 0) {
    return 1;
  }
  const remaining = deckSize - OPENING_HAND_SIZE;
  const usableDraws = Math.min(draws, remaining - SECURITY_STACK_SIZE);
  const openings = enumerateOpenings(deckSize, groups);
  const successAfter = ({ held }: Opening) =>
    coverProbability(
      remaining,
      groups.filter((_, index) => held[index] === 0),
      usableDraws,
    );
  const kept = openings.reduce((sum, opening) => sum + opening.probability * successAfter(opening), 0);
  if (!mulligan) {
    return kept;
  }
  return openings.reduce(
    (sum, opening) =>
      sum + opening.probability * (opening.held.some((count) => count > 0) ? successAfter(opening) : kept),
    0,
  );
}
