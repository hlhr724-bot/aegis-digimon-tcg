import { describe, expect, it } from "vitest";
import { validateDecklist } from "../../engine/deckValidation.js";
import { ALL_META_DECKS } from "../metaDecks/index.js";
import { randomDeck } from "./randomDecks.js";

describe("generic training deck composition", () => {
  it("reproduces legal new compositions across seeds", () => {
    const signatures = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5]) {
      const result = randomDeck(seed);
      expect(randomDeck(seed)).toEqual(result);
      expect(validateDecklist(result.deck)).toEqual({ ok: true });
      const signature = [...result.deck.mainDeck].sort().join();
      signatures.add(signature);
      expect(ALL_META_DECKS.some((source) => [...source.decklist.mainDeck].sort().join() === signature)).toBe(false);
    }
    expect(signatures.size).toBe(5);
  });
});
