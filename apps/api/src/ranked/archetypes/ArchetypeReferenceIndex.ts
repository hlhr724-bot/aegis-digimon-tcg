import type { ArchetypePresentation } from "#api/ranked/archetypes/ArchetypePresentation";

export type ArchetypeReferenceIndex = {
  archetypes: readonly string[];
  copiesByCard: ReadonlyMap<string, readonly { reference: number; copies: number }[]>;
  presentationByArchetype: ReadonlyMap<string, ArchetypePresentation>;
};
