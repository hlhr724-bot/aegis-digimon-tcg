import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import digilabDecks from "#api/bot/evolution/digilab-decks.json" with { type: "json" };
import { evolutionPilotDecks } from "#api/bot/evolution/evolutionPilotDecks";
import { validateDecklist } from "#api/engine/deckValidation";
import "#api/cards/index";

type Deck = { mainDeck: readonly string[]; eggDeck: readonly string[] };
type Pool = {
  schemaVersion: number;
  seedBase: number;
  seedBlocks: number;
  gamesPerBlock: number;
  decks: (Deck & { id: string; compositionSha256: string })[];
};

const pool: Pool = JSON.parse(
  readFileSync(new URL("../../../../tools/bot-evolution/holdout-pool.json", import.meta.url), "utf8"),
);

function getCompositionHash(deck: Deck): string {
  return createHash("sha256")
    .update(JSON.stringify([[...deck.mainDeck].sort(), [...deck.eggDeck].sort()]))
    .digest("hex");
}

describe("frozen bot evaluation holdout", () => {
  it("contains distinct legal decks with immutable composition hashes", () => {
    expect(pool.schemaVersion).toBe(1);
    expect(pool.decks.length).toBeGreaterThanOrEqual(8);
    expect(new Set(pool.decks.map((deck) => deck.id)).size).toBe(pool.decks.length);
    expect(new Set(pool.decks.map(getCompositionHash)).size).toBe(pool.decks.length);
    for (const deck of pool.decks) {
      expect(getCompositionHash(deck)).toBe(deck.compositionSha256);
      expect(validateDecklist({ mainDeck: [...deck.mainDeck], eggDeck: [...deck.eggDeck] }).ok).toBe(true);
    }
  });

  it("never shares a composition with DigiLab training or the full evolution pilot pool", () => {
    const training = new Set([
      ...digilabDecks.decks.map((entry) => getCompositionHash(entry.decklist)),
      ...evolutionPilotDecks().available.map((entry) => getCompositionHash(entry.deck)),
    ]);
    for (const deck of pool.decks) {
      expect(training.has(getCompositionHash(deck))).toBe(false);
    }
  });

  it("reserves a complete deterministic range of independent four-game blocks", () => {
    expect(pool.gamesPerBlock).toBe(4);
    expect(Number.isSafeInteger(pool.seedBase)).toBe(true);
    expect(pool.seedBase).toBeGreaterThan(0);
    expect(Number.isSafeInteger(pool.seedBlocks)).toBe(true);
    expect(pool.seedBlocks).toBeGreaterThanOrEqual(256);
    expect(pool.seedBase + pool.seedBlocks * pool.gamesPerBlock).toBeLessThan(2 ** 32);
  });
});
