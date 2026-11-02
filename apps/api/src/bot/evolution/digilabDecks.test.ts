import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { evolutionDeck, EVOLUTION_DECK_VERSIONS } from "#api/bot/evolution/decks";
import { evolutionPilotDecks } from "#api/bot/evolution/evolutionPilotDecks";
import digilabDecks from "#api/bot/evolution/digilab-decks.json" with { type: "json" };

describe("DigiLab training deck admission", () => {
  it("admits the versioned meta pilot curriculum", () => {
    for (const version of EVOLUTION_DECK_VERSIONS) {
      expect(evolutionDeck(version).deck.mainDeck).toHaveLength(50);
      expect(digilabDecks.decks.find((source) => source.deckVersion === version)?.format).toBe("EX13");
    }
  });

  it("rejects incomplete source lists without filling missing cards", () => {
    const incomplete = digilabDecks.decks.filter((source) => source.decklist.mainDeck.length !== 50);
    expect(incomplete).toHaveLength(2);
    for (const source of incomplete) {
      expect(() => evolutionDeck(source.deckVersion)).toThrow("Illegal evolution deck");
    }
  });

  it("accounts for every imported list in the executable pilot catalog", () => {
    const catalog = evolutionPilotDecks();
    const available = new Set(catalog.available.map((deck) => deck.id));
    const excluded = new Set(catalog.excluded.map((deck) => deck.id));
    expect(digilabDecks.decks.filter((source) => available.has(source.deckVersion))).toHaveLength(20);
    for (const source of digilabDecks.decks) {
      expect(Number(available.has(source.deckVersion)) + Number(excluded.has(source.deckVersion))).toBe(1);
    }
  });

  it("returns isolated copies of source decks with stable content fingerprints", () => {
    const { available } = evolutionPilotDecks();
    const admitted = available.find((deck) => deck.id.startsWith("digilab-"))!;
    expect(admitted).toBeDefined();
    const first = evolutionDeck(admitted.id);
    first.deck.mainDeck.pop();
    expect(evolutionDeck(admitted.id)).toEqual(admitted);
  });
});
