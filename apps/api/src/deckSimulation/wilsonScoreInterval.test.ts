import { describe, expect, it } from "vitest";
import { wilsonScoreInterval } from "#api/deckSimulation/wilsonScoreInterval";

describe("wilsonScoreInterval", () => {
  it("brackets an even score symmetrically", () => {
    const [low, high] = wilsonScoreInterval({ points: 10, games: 20 })!;
    expect(low).toBeCloseTo(0.2993, 3);
    expect(high).toBeCloseTo(0.7007, 3);
  });

  it("stays inside 0 and 1 for a perfect record", () => {
    const [low, high] = wilsonScoreInterval({ points: 10, games: 10 })!;
    expect(low).toBeCloseTo(0.7225, 3);
    expect(high).toBeCloseTo(1, 12);
  });

  it("has no interval before any game", () => {
    expect(wilsonScoreInterval({ points: 0, games: 0 })).toBeNull();
  });
});
