import type { ArchetypePresentation } from "#api/ranked/archetypes/ArchetypePresentation";
import type { ArchetypeReference } from "#api/ranked/archetypes/ArchetypeReference";
import type { ArchetypeReferenceIndex } from "#api/ranked/archetypes/ArchetypeReferenceIndex";
import { countDeckCards } from "#api/ranked/archetypes/countDeckCards";

export function buildArchetypeReferenceIndex(references: readonly ArchetypeReference[]): ArchetypeReferenceIndex {
  const copiesByCard = new Map<string, { reference: number; copies: number }[]>();
  const presentationByArchetype = new Map<string, ArchetypePresentation>();
  for (const [reference, { archetype, mainDeck, presentation }] of references.entries()) {
    if (!presentationByArchetype.has(archetype)) {
      presentationByArchetype.set(archetype, presentation);
    }
    for (const [card, copies] of countDeckCards(mainDeck)) {
      const entries = copiesByCard.get(card) ?? [];
      entries.push({ reference, copies });
      copiesByCard.set(card, entries);
    }
  }
  return { archetypes: references.map((reference) => reference.archetype), copiesByCard, presentationByArchetype };
}
