import { describe, expect, it } from "vitest";
import type { ArchetypeReference } from "#api/ranked/archetypes/ArchetypeReference";
import { classifyDeckArchetype } from "#api/ranked/archetypes/classifyDeckArchetype";
import { buildArchetypeReferenceIndex } from "#api/ranked/archetypes/buildArchetypeReferenceIndex";

type DeckParams = { prefix: string; shared?: number; filler?: string };

function buildDeck({ prefix, shared = 50, filler = "FILLER" }: DeckParams): string[] {
  return Array.from({ length: 50 }, (_, index) => {
    const source = index < shared ? prefix : filler;
    return `${source}-${Math.floor(index / 4)}`;
  });
}

function buildReference(archetype: string, prefix: string): ArchetypeReference {
  return { archetype, mainDeck: buildDeck({ prefix }), presentation: { coverCardId: null, colors: [] } };
}

const index = buildArchetypeReferenceIndex([buildReference("Examon", "EXA"), buildReference("Jupitermon", "JUP")]);

describe("deck archetype classification", () => {
  it("names the archetype of the closest reference list", () => {
    expect(classifyDeckArchetype({ mainDeck: buildDeck({ prefix: "JUP", shared: 40 }), index })).toBe("Jupitermon");
  });

  it("leaves a deck unidentified when it shares fewer than half its cards with every list", () => {
    expect(classifyDeckArchetype({ mainDeck: buildDeck({ prefix: "EXA", shared: 24 }), index })).toBe("unknown");
    expect(classifyDeckArchetype({ mainDeck: buildDeck({ prefix: "EXA", shared: 25 }), index })).toBe("Examon");
  });

  it("counts each copy of a card once", () => {
    const mainDeck = Array<string>(50).fill("EXA-0");
    expect(classifyDeckArchetype({ mainDeck, index })).toBe("unknown");
  });

  it("resolves equally close lists by archetype name", () => {
    const tied = buildArchetypeReferenceIndex([buildReference("Zeta", "EXA"), buildReference("Alpha", "EXA")]);
    expect(classifyDeckArchetype({ mainDeck: buildDeck({ prefix: "EXA" }), index: tied })).toBe("Alpha");
  });
});
