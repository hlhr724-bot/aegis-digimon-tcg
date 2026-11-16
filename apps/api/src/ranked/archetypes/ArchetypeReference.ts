import type { ArchetypePresentation } from "#api/ranked/archetypes/ArchetypePresentation";

export type ArchetypeReference = {
  archetype: string;
  mainDeck: readonly string[];
  presentation: ArchetypePresentation;
};
