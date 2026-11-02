import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared";
import { deckSectionLevel } from "@/screens/deckSectionLevel";

function levelOf(cardId: string): number | undefined {
  const definition = getCardDefinition(cardId);
  if (!definition) throw new Error(`Missing card ${cardId}`);
  return deckSectionLevel(definition);
}

describe("deckSectionLevel", () => {
  it("places a Digimon/Option dual card under its Digimon level", () => {
    expect(levelOf("BT25-057")).toBe(5);
  });

  it("places a plain Digimon under its level", () => {
    expect(levelOf("BT1-009")).toBeDefined();
  });

  it("leaves Tamers and Options out of the level sections", () => {
    expect(levelOf("BT1-085")).toBeUndefined();
    expect(levelOf("BT1-090")).toBeUndefined();
  });
});
