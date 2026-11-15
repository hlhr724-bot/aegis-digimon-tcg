import { describe, expect, it } from "vitest";
import { getDeckKeyDigimon } from "#api/ranked/archetypes/getDeckKeyDigimon";

describe("deck key Digimon", () => {
  it("names the final form with the most copies, not a single higher tech card", () => {
    const mainDeck = ["AD1-014", "AD1-014", "AD1-014", "BT1-084", "BT1-010", "BT1-010", "BT1-010", "BT1-010"];
    expect(getDeckKeyDigimon({ mainDeck })?.nameEn).toBe("MetalGarurumon");
  });

  it("falls back to the most played Digimon when the deck has no final form", () => {
    expect(getDeckKeyDigimon({ mainDeck: ["BT1-010", "BT1-010", "BT1-029"] })?.nameEn).toBe("Agumon");
  });

  it("has no name for a deck without known Digimon", () => {
    expect(getDeckKeyDigimon({ mainDeck: ["UNKNOWN-1"] })).toBeNull();
  });
});
