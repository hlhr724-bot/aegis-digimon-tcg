import { describe, expect, it } from "vitest";
import { binomialCoefficient } from "#shared/decks/goldfish/binomialCoefficient";
import { drawsBeforeTurn } from "#shared/decks/goldfish/drawsBeforeTurn";
import { goldfishHitProbability } from "#shared/decks/goldfish/goldfishHitProbability";
import { goldfishTurnCurve } from "#shared/decks/goldfish/goldfishTurnCurve";

const missAll = (deck: number, copies: number, seen: number) =>
  binomialCoefficient(deck - copies, seen) / binomialCoefficient(deck, seen);

function simulate({
  groups,
  draws,
  mulligan,
  trials,
}: {
  groups: number[];
  draws: number;
  mulligan: boolean;
  trials: number;
}): number {
  let state = 12345;
  const random = () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return state / 2 ** 32;
  };
  const deck = groups.flatMap((copies, group) => Array.from({ length: copies }, () => group));
  while (deck.length < 50) deck.push(-1);
  const shuffle = () => {
    for (let index = deck.length - 1; index > 0; index--) {
      const swap = Math.floor(random() * (index + 1));
      [deck[index], deck[swap]] = [deck[swap]!, deck[index]!];
    }
  };
  let hits = 0;
  for (let trial = 0; trial < trials; trial++) {
    shuffle();
    if (mulligan && !deck.slice(0, 5).some((card) => card >= 0)) shuffle();
    const seen = new Set([...deck.slice(0, 5), ...deck.slice(10, 10 + draws)]);
    if (groups.every((_, group) => seen.has(group))) hits++;
  }
  return hits / trials;
}

describe("goldfish hit probability", () => {
  it("matches the hypergeometric chance of one card group in the opening hand", () => {
    expect(goldfishHitProbability({ deckSize: 50, groups: [4], draws: 0, mulligan: false })).toBeCloseTo(
      1 - 1370754 / 2118760,
      12,
    );
  });

  it("ignores the security stack when it counts cards seen by later turns", () => {
    expect(goldfishHitProbability({ deckSize: 50, groups: [4], draws: 3, mulligan: false })).toBeCloseTo(
      1 - missAll(50, 4, 8),
      12,
    );
  });

  it("adds a fresh hand when a mulligan replaces an opening hand without the card", () => {
    expect(goldfishHitProbability({ deckSize: 50, groups: [3], draws: 2, mulligan: true })).toBeCloseTo(
      1 - missAll(50, 3, 5) * missAll(50, 3, 7),
      12,
    );
  });

  it("requires every group of a combo by inclusion and exclusion", () => {
    const seen = 9;
    const expected = 1 - missAll(50, 4, seen) - missAll(50, 2, seen) + missAll(50, 6, seen);
    expect(goldfishHitProbability({ deckSize: 50, groups: [4, 2], draws: 4, mulligan: false })).toBeCloseTo(
      expected,
      12,
    );
  });

  it("agrees with a shuffled-deck simulation of a combo with a mulligan", () => {
    const exact = goldfishHitProbability({ deckSize: 50, groups: [4, 3, 2], draws: 4, mulligan: true });
    expect(Math.abs(exact - simulate({ groups: [4, 3, 2], draws: 4, mulligan: true, trials: 40000 }))).toBeLessThan(
      0.01,
    );
  });

  it("counts an empty combo as always assembled", () => {
    expect(goldfishHitProbability({ deckSize: 50, groups: [], draws: 0, mulligan: true })).toBe(1);
  });

  it("stops drawing when the deck runs out", () => {
    expect(goldfishHitProbability({ deckSize: 50, groups: [1], draws: 100, mulligan: false })).toBeCloseTo(
      1 - missAll(50, 1, 45),
      12,
    );
  });

  it.each([
    { deckSize: 9, groups: [1], draws: 0 },
    { deckSize: 50, groups: [0], draws: 0 },
    { deckSize: 50, groups: [30, 30], draws: 0 },
    { deckSize: 50, groups: [1], draws: -1 },
  ])("rejects deck $deckSize with groups $groups and $draws draws", (params) => {
    expect(() => goldfishHitProbability({ ...params, mulligan: false })).toThrow("Invalid goldfish");
  });
});

describe("goldfish draws and turn curve", () => {
  it("skips the first draw only for the player going first", () => {
    expect([0, 1, 2, 3].map((turn) => drawsBeforeTurn({ turn, goingFirst: true }))).toEqual([0, 0, 1, 2]);
    expect([0, 1, 2, 3].map((turn) => drawsBeforeTurn({ turn, goingFirst: false }))).toEqual([0, 1, 2, 3]);
  });

  it("rises with every turn and starts at the opening hand", () => {
    const curve = goldfishTurnCurve({ deckSize: 50, groups: [4], goingFirst: false, mulligan: false, lastTurn: 5 });
    expect(curve).toHaveLength(6);
    expect(curve[0]).toBeCloseTo(1 - missAll(50, 4, 5), 12);
    for (let turn = 1; turn < curve.length; turn++) expect(curve[turn]!).toBeGreaterThan(curve[turn - 1]!);
  });
});
