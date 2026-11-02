import { ALL_FAMOUS_DECKS, allCards } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { reviewDeckName } from "./deckNameModeration.js";

describe("reviewDeckName", () => {
  it.each([
    "fuck combo",
    "Sh1t Deck",
    "Caralho Rush",
    "PORRA de deck",
    "Puta Aggro",
    "merdamon",
    "fdp burn",
    "Muerte a la Royal Base",
    "cazzo deck",
    "死亡",
  ])("refuses %s", (name) => {
    expect(reviewDeckName(name).allowed).toBe(false);
  });

  it.each([
    "Jesmon Blitz",
    "Purple Recursion",
    "Cuco Control",
    "Puppet Lock",
    "Rolamon Ramp",
    "Picante Red",
    "Temporal Fodder",
    "Corporation",
  ])("allows %s", (name) => {
    expect(reviewDeckName(name)).toEqual({ allowed: true, name });
  });

  it("collapses whitespace and caps the length", () => {
    const review = reviewDeckName(`  Omnimon   ${"x".repeat(80)}  `);
    expect(review.allowed && review.name.startsWith("Omnimon x")).toBe(true);
    expect(review.allowed && review.name.length).toBe(40);
  });

  it("refuses an empty name", () => {
    expect(reviewDeckName("   ").allowed).toBe(false);
  });

  // Deck names are mostly card names, so a filter that blocks one of them blocks real decks.
  it("allows every card name and famous deck archetype", () => {
    const names = new Set([
      ...allCards().map((card) => card.nameEn),
      ...ALL_FAMOUS_DECKS.map((deck) => deck.archetype),
    ]);
    const blocked = [...names].filter((name) => !reviewDeckName(name).allowed);
    expect(blocked).toEqual([]);
  });
});
