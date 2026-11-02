import { describe, expect, it } from "vitest";
import { calculateElo } from "#api/ranked/calculateElo";
import { canPairRankedPlayers } from "#api/ranked/canPairRankedPlayers";
import { RankedRoundClock } from "#api/ranked/RankedRoundClock";
import { getRankedSeason } from "#api/ranked/getRankedSeason";
import { getRankedTier } from "@aegis/shared/ranked/getRankedTier";

const entry = { rating: 1000, queuedAt: 0, region: "south_america", format: "standard", slot: "blue" };

describe("competitive matchmaking rules", () => {
  it("uses expected results, draws and a nonnegative rating", () => {
    expect(calculateElo({ rating: 1000, opponentRating: 1000, score: 1 })).toBe(1016);
    expect(calculateElo({ rating: 1000, opponentRating: 1000, score: 0 })).toBe(984);
    expect(calculateElo({ rating: 1000, opponentRating: 1000, score: 0.5 })).toBe(1000);
    expect(calculateElo({ rating: 0, opponentRating: 0, score: 0 })).toBe(0);
  });
  it("expands rating and region only after both players have waited", () => {
    const second = { ...entry, rating: 1200, region: "europe" };
    expect(canPairRankedPlayers({ first: entry, second, now: 59_999 })).toBe(false);
    expect(canPairRankedPlayers({ first: entry, second, now: 60_000 })).toBe(true);
    expect(canPairRankedPlayers({ first: entry, second: { ...second, queuedAt: 59_000 }, now: 60_000 })).toBe(false);
    expect(canPairRankedPlayers({ first: entry, second: { ...entry, rating: 1401 }, now: 900_000 })).toBe(false);
  });
  it("never mixes formats or deployment slots", () => {
    expect(canPairRankedPlayers({ first: entry, second: { ...entry, format: "BT10" }, now: 900_000 })).toBe(false);
    expect(canPairRankedPlayers({ first: entry, second: { ...entry, slot: "green" }, now: 900_000 })).toBe(false);
  });
  it("keeps contiguous eight-week UTC seasons and tier thresholds", () => {
    const first = getRankedSeason(Date.UTC(2026, 9, 17));
    expect(first.endsAt - first.startsAt).toBe(56 * 86_400_000);
    expect(getRankedSeason(first.endsAt).id).toBe(first.id + 1);
    expect(getRankedSeason(first.endsAt).startsAt).toBe(first.endsAt);
    expect([999, 1000, 1200, 1400, 1600].map(getRankedTier)).toEqual([
      "bronze",
      "silver",
      "gold",
      "platinum",
      "diamond",
    ]);
  });
});

describe("ranked overtime", () => {
  it("finishes turn zero and three further turns before drawing at a safe boundary", () => {
    const clock = new RankedRoundClock(0);
    expect(clock.shouldDraw({ now: 48 * 60_000 - 1, turn: 8, safe: true })).toBe(false);
    expect(clock.shouldDraw({ now: 48 * 60_000, turn: 8, safe: true })).toBe(false);
    expect(clock.shouldDraw({ now: 49 * 60_000, turn: 11, safe: true })).toBe(false);
    expect(clock.shouldDraw({ now: 49 * 60_000, turn: 12, safe: false })).toBe(false);
    expect(clock.shouldDrawBeforeTurn({ now: 49 * 60_000, turn: 12 })).toBe(true);
  });
  it("caps overtime at six wall-clock minutes without interrupting effects", () => {
    const clock = new RankedRoundClock(0);
    clock.shouldDraw({ now: 48 * 60_000, turn: 8, safe: false });
    expect(clock.shouldDraw({ now: 54 * 60_000, turn: 8, safe: false })).toBe(false);
    expect(clock.shouldDraw({ now: 54 * 60_000, turn: 8, safe: true })).toBe(true);
  });
});
