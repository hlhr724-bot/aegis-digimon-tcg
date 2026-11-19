import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ArraySchema } from "@colyseus/schema";
import { describe, expect, it, vi } from "vitest";
import { CardInstance } from "@aegis/shared/schema/CardInstance";
import { GameState } from "@aegis/shared/schema/GameState";
import { Zone, type Seat } from "@aegis/shared/schema/enums";
import { GameEngine } from "#api/engine/GameEngine";
import { SeededRandom } from "#api/engine/random/SeededRandom";
import {
  buildPlayerState,
  finalizeSecurity,
  makeRng,
  mulliganRedraw,
  runSetup,
  seatSeed,
  shuffleDecks,
  shuffleInPlace,
  type Decklist,
  type Rng,
} from "#api/engine/setup";
import { fillZone } from "#api/engine/state/access";

const RANDOM_KEY = "5a".repeat(32);
const ONE_SIDED_Z_AT_P_0_001 = 3.0902;
const TWO_SIDED_Z_AT_P_0_001 = 3.2905;
const DECK_SIZE = 50;
const HAND_SIZE = 5;
const FOUR_COPY_CARD = "BT1-010";
const FOUR_COPY_CARDS = Array.from({ length: 12 }, (_, group) => `BT1-0${10 + group}`);
const PROFILE_DECK: Decklist = {
  mainDeck: [...FOUR_COPY_CARDS.flatMap((cardId) => [cardId, cardId, cardId, cardId]), "BT1-085", "BT1-086"],
  eggDeck: ["BT1-001", "BT1-001", "BT1-001", "BT1-001", "BT1-002"],
};
const POSITION_GAMES = 4000;
const BIASED_GAMES = 400;
const SETUP_GAMES = 1000;
const SECURITY_SHUFFLES = 12_000;
const STREAM_DRAWS = 200_000;

type ChiSquareResult = { statistic: number; critical: number };
type MeanResult = { mean: number; expected: number; tolerance: number };

function chiSquareCritical(degreesOfFreedom: number): number {
  const spread = 2 / (9 * degreesOfFreedom);
  return degreesOfFreedom * (1 - spread + ONE_SIDED_Z_AT_P_0_001 * Math.sqrt(spread)) ** 3;
}

function chiSquare({ observed, expected }: { observed: readonly number[]; expected: readonly number[] }): number {
  return observed.reduce((sum, count, index) => sum + (count - expected[index]!) ** 2 / expected[index]!, 0);
}

function measurePositionBias({ orders, size }: { orders: readonly number[][]; size: number }): ChiSquareResult {
  const counts = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  for (const order of orders) {
    order.forEach((original, position) => {
      counts[original]![position]! += 1;
    });
  }
  const expected = new Array<number>(size * size).fill(orders.length / size);
  const rankScale = (size - 1) / size;
  return {
    statistic: chiSquare({ observed: counts.flat(), expected }) * rankScale,
    critical: chiSquareCritical((size - 1) ** 2),
  };
}

function measureMean({ samples, expected }: { samples: readonly number[]; expected: number }): MeanResult {
  const mean = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
  const variance = samples.reduce((sum, sample) => sum + (sample - mean) ** 2, 0) / (samples.length - 1);
  return { mean, expected, tolerance: TWO_SIDED_Z_AT_P_0_001 * Math.sqrt(variance / samples.length) };
}

function correlation({ first, second }: { first: readonly number[]; second: readonly number[] }): number {
  const firstMean = first.reduce((sum, value) => sum + value, 0) / first.length;
  const secondMean = second.reduce((sum, value) => sum + value, 0) / second.length;
  let covariance = 0;
  let firstVariance = 0;
  let secondVariance = 0;
  for (let index = 0; index < first.length; index += 1) {
    const firstDelta = first[index]! - firstMean;
    const secondDelta = second[index]! - secondMean;
    covariance += firstDelta * secondDelta;
    firstVariance += firstDelta ** 2;
    secondVariance += secondDelta ** 2;
  }
  return covariance / Math.sqrt(firstVariance * secondVariance);
}

function correlationLimit(samples: number): number {
  return TWO_SIDED_Z_AT_P_0_001 / Math.sqrt(samples);
}

function choose(total: number, picked: number): number {
  let result = 1;
  for (let index = 1; index <= picked; index += 1) result = (result * (total - picked + index)) / index;
  return result;
}

function fourCopyHandProbabilities(): number[] {
  const exact = [0, 1].map(
    (copies) => (choose(4, copies) * choose(DECK_SIZE - 4, HAND_SIZE - copies)) / choose(DECK_SIZE, HAND_SIZE),
  );
  return [...exact, 1 - exact.reduce((sum, probability) => sum + probability, 0)];
}

function measureFourCopyHands(copiesPerHand: readonly number[]): ChiSquareResult {
  const observed = [0, 0, 0];
  for (const copies of copiesPerHand) observed[Math.min(copies, 2)]! += 1;
  const expected = fourCopyHandProbabilities().map((probability) => probability * copiesPerHand.length);
  return { statistic: chiSquare({ observed, expected }), critical: chiSquareCritical(2) };
}

function countAdjacentPairs(order: readonly string[]): number {
  let pairs = 0;
  for (let index = 1; index < order.length; index += 1) if (order[index] === order[index - 1]) pairs += 1;
  return pairs;
}

function countMatchingPositions<T>({ first, second }: { first: readonly T[]; second: readonly T[] }): number {
  return first.reduce((matches, value, index) => matches + (value === second[index] ? 1 : 0), 0);
}

function copyCounts(cards: readonly string[]): number[] {
  const counts = new Map<string, number>();
  for (const cardId of cards) counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  return [...counts.values()];
}

const EXPECTED_ADJACENT_PAIRS =
  copyCounts(PROFILE_DECK.mainDeck).reduce((sum, copies) => sum + copies * (copies - 1), 0) / DECK_SIZE;
const EXPECTED_SEAT_MATCHES =
  copyCounts(PROFILE_DECK.mainDeck).reduce((sum, copies) => sum + copies ** 2, 0) / DECK_SIZE;

function keyedStream(seed: number, seat: Seat = 0): Rng {
  return makeRng(seatSeed(seed, seat), RANDOM_KEY);
}

function sampleDeckOrders(games: number): number[][] {
  const player = buildPlayerState(0, "session", "Player", PROFILE_DECK);
  return Array.from({ length: games }, (_, game) => {
    const before = new Map(player.deck.map((card, position) => [card.instanceId, position]));
    shuffleDecks(player, keyedStream(game + 1));
    return player.deck.map((card) => before.get(card.instanceId)!);
  });
}

function orderedIndexes(size: number): number[] {
  return Array.from({ length: size }, (_, index) => index);
}

function shuffleWithSkippedSelfSwap(items: number[], random: Rng): number[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * index);
    [items[index], items[target]] = [items[target]!, items[index]!];
  }
  return items;
}

function shuffleWithRandomComparator<T>(items: T[], random: Rng): T[] {
  return items.sort(() => random() - 0.5);
}

function shuffleOnlyTopHalf<T>(items: readonly T[], random: Rng): T[] {
  const half = items.length / 2;
  return [...shuffleInPlace(items.slice(0, half), random), ...items.slice(half)];
}

function cardIds(cards: Iterable<CardInstance>): string[] {
  return Array.from(cards, (card) => card.cardId);
}

type SetupSample = {
  openingCopies: number[];
  mulliganCopies: number[];
  adjacentPairs: number[];
  seatMatches: number[];
  openingCopiesBySeat: [number[], number[]];
};

function sampleSetups(games: number): SetupSample {
  const sample: SetupSample = {
    openingCopies: [],
    mulliganCopies: [],
    adjacentPairs: [],
    seatMatches: [],
    openingCopiesBySeat: [[], []],
  };
  for (let seed = 1; seed <= games; seed += 1) {
    const state = new GameState();
    state.players = new ArraySchema();
    const setup = runSetup(state, {
      seats: [
        { sessionId: "first", displayName: "First", deck: PROFILE_DECK },
        { sessionId: "second", displayName: "Second", deck: PROFILE_DECK },
      ],
      firstSeat: 0,
      seed,
      randomKey: RANDOM_KEY,
    });
    const orders = ([0, 1] as const).map((seat) => {
      const player = state.players[seat]!;
      const hand = cardIds(player.hand);
      const copies = hand.filter((cardId) => cardId === FOUR_COPY_CARD).length;
      sample.openingCopies.push(copies);
      sample.openingCopiesBySeat[seat].push(copies);
      const order = [...hand, ...cardIds(player.deck)];
      sample.adjacentPairs.push(countAdjacentPairs(order));
      return order;
    });
    sample.seatMatches.push(countMatchingPositions({ first: orders[0]!, second: orders[1]! }));
    for (const seat of [0, 1] as const) {
      const player = state.players[seat]!;
      mulliganRedraw(player, setup.rngForSeat(seat));
      sample.mulliganCopies.push(cardIds(player.hand).filter((cardId) => cardId === FOUR_COPY_CARD).length);
    }
  }
  return sample;
}

describe("deck shuffle statistics", () => {
  const deckOrders = sampleDeckOrders(POSITION_GAMES);
  const setups = sampleSetups(SETUP_GAMES);

  it("places every card in every deck position with equal frequency", () => {
    const { statistic, critical } = measurePositionBias({ orders: deckOrders, size: DECK_SIZE });
    expect(statistic).toBeLessThan(critical);
  });

  it("detects a Fisher-Yates shuffle that never leaves a card in place", () => {
    const orders = Array.from({ length: BIASED_GAMES }, (_, game) =>
      shuffleWithSkippedSelfSwap(orderedIndexes(DECK_SIZE), keyedStream(game + 1)),
    );
    const { statistic, critical } = measurePositionBias({ orders, size: DECK_SIZE });
    expect(statistic).toBeGreaterThan(critical);
  });

  it("detects a shuffle that sorts with a random comparator", () => {
    const orders = Array.from({ length: BIASED_GAMES }, (_, game) =>
      shuffleWithRandomComparator(orderedIndexes(DECK_SIZE), keyedStream(game + 1)),
    );
    const { statistic, critical } = measurePositionBias({ orders, size: DECK_SIZE });
    expect(statistic).toBeGreaterThan(critical);
  });

  it("deals copies of a four-copy card into the opening hand at the hypergeometric rate", () => {
    const { statistic, critical } = measureFourCopyHands(setups.openingCopies);
    expect(statistic).toBeLessThan(critical);
  });

  it("deals copies of a four-copy card into the mulligan hand at the hypergeometric rate", () => {
    const { statistic, critical } = measureFourCopyHands(setups.mulliganCopies);
    expect(statistic).toBeLessThan(critical);
  });

  it("detects an opening hand dealt from an unshuffled deck", () => {
    const copiesPerHand = setups.openingCopies.map(
      () => PROFILE_DECK.mainDeck.slice(0, HAND_SIZE).filter((cardId) => cardId === FOUR_COPY_CARD).length,
    );
    const { statistic, critical } = measureFourCopyHands(copiesPerHand);
    expect(statistic).toBeGreaterThan(critical);
  });

  it("leaves identical cards adjacent only as often as chance predicts", () => {
    const { mean, expected, tolerance } = measureMean({
      samples: setups.adjacentPairs,
      expected: EXPECTED_ADJACENT_PAIRS,
    });
    expect(Math.abs(mean - expected)).toBeLessThan(tolerance);
  });

  it("detects the clumps left by a shuffle that mixes only the top half", () => {
    const samples = Array.from({ length: BIASED_GAMES }, (_, game) =>
      countAdjacentPairs(shuffleOnlyTopHalf(PROFILE_DECK.mainDeck, keyedStream(game + 1))),
    );
    const { mean, expected, tolerance } = measureMean({ samples, expected: EXPECTED_ADJACENT_PAIRS });
    expect(Math.abs(mean - expected)).toBeGreaterThan(tolerance);
  });

  it("gives consecutive games unrelated deck orders", () => {
    const observed = [0, 0, 0, 0, 0];
    for (let game = 1; game < deckOrders.length; game += 1) {
      const matches = countMatchingPositions({ first: deckOrders[game - 1]!, second: deckOrders[game]! });
      observed[Math.min(matches, 4)]! += 1;
    }
    const exact = [1, 1, 1 / 2, 1 / 6].map((weight) => weight / Math.E);
    const probabilities = [...exact, 1 - exact.reduce((sum, probability) => sum + probability, 0)];
    const expected = probabilities.map((probability) => probability * (deckOrders.length - 1));
    expect(chiSquare({ observed, expected })).toBeLessThan(chiSquareCritical(4));
  });

  it("gives a card positions in consecutive games that do not correlate", () => {
    const positions = deckOrders.map((order) => order.indexOf(0));
    const coefficient = correlation({ first: positions.slice(0, -1), second: positions.slice(1) });
    expect(Math.abs(coefficient)).toBeLessThan(correlationLimit(positions.length - 1));
  });

  it("detects consecutive games that reuse one deck order", () => {
    const positions = deckOrders.map((_, game) => deckOrders[game - (game % 2)]!.indexOf(0));
    const coefficient = correlation({ first: positions.slice(0, -1), second: positions.slice(1) });
    expect(Math.abs(coefficient)).toBeGreaterThan(correlationLimit(positions.length - 1));
  });

  it("shuffles the two seats of one game independently", () => {
    const { mean, expected, tolerance } = measureMean({
      samples: setups.seatMatches,
      expected: EXPECTED_SEAT_MATCHES,
    });
    expect(Math.abs(mean - expected)).toBeLessThan(tolerance);
    const coefficient = correlation({
      first: setups.openingCopiesBySeat[0],
      second: setups.openingCopiesBySeat[1],
    });
    expect(Math.abs(coefficient)).toBeLessThan(correlationLimit(SETUP_GAMES));
  });
});

describe("security stack shuffle statistics", () => {
  const stackSize = 5;

  function createEngine(): GameEngine {
    const engine = new GameEngine(new GameState(), {
      seed: 1,
      randomKey: RANDOM_KEY,
      emit: vi.fn(),
      requestDecision: vi.fn(),
    });
    for (const seat of [0, 1] as const) {
      engine.seatPlayer(seat, `seat-${seat}`, {
        displayName: `Player ${seat}`,
        deck: { mainDeck: [], eggDeck: [] },
      });
    }
    return engine;
  }

  function createStack(): CardInstance[] {
    return orderedIndexes(stackSize).map((index) => {
      const card = new CardInstance();
      card.instanceId = String(index);
      card.cardId = FOUR_COPY_CARD;
      card.ownerSeat = 0;
      return card;
    });
  }

  function measurePermutationBias(orders: readonly number[][]): ChiSquareResult {
    const counts = new Map<string, number>();
    for (const order of orders) counts.set(order.join(""), (counts.get(order.join("")) ?? 0) + 1);
    const permutations = 120;
    const observed = [...counts.values(), ...new Array<number>(permutations - counts.size).fill(0)];
    const expected = new Array<number>(permutations).fill(orders.length / permutations);
    return { statistic: chiSquare({ observed, expected }), critical: chiSquareCritical(permutations - 1) };
  }

  it("refuses to shuffle security before the match stream exists", () => {
    const engine = createEngine();
    fillZone(engine.state.players[0]!, Zone.Security, createStack());
    expect(() => engine.primitives.shuffleSecurity(0)).toThrow("initialized match random stream");
  });

  it("produces every security order and position with equal frequency", () => {
    const engine = createEngine();
    const player = engine.state.players[0]!;
    const stack = createStack();
    const orders = Array.from({ length: SECURITY_SHUFFLES }, (_, shuffle) => {
      const random = keyedStream(shuffle + 1);
      engine.rngForSeat = () => random;
      fillZone(player, Zone.Security, stack);
      engine.primitives.shuffleSecurity(0);
      return player.security.map((card) => Number(card.instanceId));
    });
    const positions = measurePositionBias({ orders, size: stackSize });
    expect(positions.statistic).toBeLessThan(positions.critical);
    const permutations = measurePermutationBias(orders);
    expect(permutations.statistic).toBeLessThan(permutations.critical);
  });

  it("detects biased security orders", () => {
    for (const shuffle of [shuffleWithSkippedSelfSwap, shuffleWithRandomComparator]) {
      const orders = Array.from({ length: SECURITY_SHUFFLES }, (_, game) =>
        shuffle(orderedIndexes(stackSize), keyedStream(game + 1)),
      );
      const { statistic, critical } = measurePermutationBias(orders);
      expect(statistic).toBeGreaterThan(critical);
    }
  });
});

describe("shuffle random source", () => {
  it("never reads process randomness during setup, mulligan or security shuffles", () => {
    const ambient = vi.spyOn(Math, "random");
    try {
      const state = new GameState();
      state.players = new ArraySchema();
      const setup = runSetup(state, {
        seats: [
          { sessionId: "first", displayName: "First", deck: PROFILE_DECK },
          { sessionId: "second", displayName: "Second", deck: PROFILE_DECK },
        ],
        firstSeat: 0,
        seed: 7,
        randomKey: RANDOM_KEY,
      });
      for (const seat of [0, 1] as const) mulliganRedraw(state.players[seat]!, setup.rngForSeat(seat));
      finalizeSecurity(state);
      const engine = new GameEngine(state, { seed: 7, randomKey: RANDOM_KEY, emit: vi.fn(), requestDecision: vi.fn() });
      engine.rngForSeat = setup.rngForSeat;
      engine.primitives.shuffleSecurity(0);
      shuffleInPlace(orderedIndexes(DECK_SIZE), setup.rngForSeat(1));
      expect(ambient).not.toHaveBeenCalled();
    } finally {
      ambient.mockRestore();
    }
  });

  it("keeps process randomness out of engine, room, manual and story sources", () => {
    const apiSource = fileURLToPath(new URL("../../", import.meta.url));
    const offenders = ["engine", "rooms", "manual", "story"].flatMap((domain) =>
      readdirSync(`${apiSource}${domain}`, { recursive: true, encoding: "utf8" })
        .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && !file.startsWith("testkit/"))
        .filter((file) => readFileSync(`${apiSource}${domain}/${file}`, "utf8").includes("Math.random"))
        .map((file) => `${domain}/${file}`),
    );
    expect(offenders.sort()).toEqual(["engine/botDeck.ts", "engine/effects/verbs/securityStack.ts"]);
  });
});

describe("seeded random stream statistics", () => {
  type StreamMeasurement = {
    mean: number;
    meanTolerance: number;
    buckets: ChiSquareResult;
    pairs: ChiSquareResult;
    bits: ChiSquareResult;
    lagOneCorrelation: number;
    lagOneLimit: number;
  };

  function measureStream(next: () => number): StreamMeasurement {
    const draws = Array.from({ length: STREAM_DRAWS }, next);
    const buckets = new Array<number>(256).fill(0);
    const pairs = new Array<number>(256).fill(0);
    const bits = new Array<number>(32).fill(0);
    draws.forEach((draw, index) => {
      buckets[Math.floor(draw * 256)]! += 1;
      if (index % 2 === 1) pairs[Math.floor(draws[index - 1]! * 16) * 16 + Math.floor(draw * 16)]! += 1;
      const word = Math.floor(draw * 0x100000000);
      for (let bit = 0; bit < 32; bit += 1) bits[bit]! += (word >>> bit) & 1;
    });
    const half = STREAM_DRAWS / 2;
    return {
      mean: draws.reduce((sum, draw) => sum + draw, 0) / STREAM_DRAWS,
      meanTolerance: TWO_SIDED_Z_AT_P_0_001 * Math.sqrt(1 / 12 / STREAM_DRAWS),
      buckets: {
        statistic: chiSquare({ observed: buckets, expected: new Array<number>(256).fill(STREAM_DRAWS / 256) }),
        critical: chiSquareCritical(255),
      },
      pairs: {
        statistic: chiSquare({ observed: pairs, expected: new Array<number>(256).fill(half / 256) }),
        critical: chiSquareCritical(255),
      },
      bits: {
        statistic: bits.reduce((sum, ones) => sum + (ones - half) ** 2 / (STREAM_DRAWS / 4), 0),
        critical: chiSquareCritical(32),
      },
      lagOneCorrelation: correlation({ first: draws.slice(0, -1), second: draws.slice(1) }),
      lagOneLimit: correlationLimit(STREAM_DRAWS - 1),
    };
  }

  it.each([RANDOM_KEY, undefined])("shows no bias or serial correlation with key %s", (randomKey) => {
    const generator = new SeededRandom({ seed: 20261118, randomKey });
    const stream = measureStream(() => generator.next());
    expect(Math.abs(stream.mean - 0.5)).toBeLessThan(stream.meanTolerance);
    expect(stream.buckets.statistic).toBeLessThan(stream.buckets.critical);
    expect(stream.pairs.statistic).toBeLessThan(stream.pairs.critical);
    expect(stream.bits.statistic).toBeLessThan(stream.bits.critical);
    expect(Math.abs(stream.lagOneCorrelation)).toBeLessThan(stream.lagOneLimit);
  });

  it("detects a skewed stream and a serially correlated stream", () => {
    const skewedGenerator = new SeededRandom({ seed: 1 });
    const skewed = measureStream(() => skewedGenerator.next() ** 1.1);
    expect(Math.abs(skewed.mean - 0.5)).toBeGreaterThan(skewed.meanTolerance);
    expect(skewed.buckets.statistic).toBeGreaterThan(skewed.buckets.critical);

    const smoothedGenerator = new SeededRandom({ seed: 1 });
    let previous = smoothedGenerator.next();
    const smoothed = measureStream(() => {
      const current = smoothedGenerator.next();
      const blended = (previous + 9 * current) / 10;
      previous = current;
      return blended;
    });
    expect(Math.abs(smoothed.lagOneCorrelation)).toBeGreaterThan(smoothed.lagOneLimit);
    expect(smoothed.pairs.statistic).toBeGreaterThan(smoothed.pairs.critical);
  });
});
