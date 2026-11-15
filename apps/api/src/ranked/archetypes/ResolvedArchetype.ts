import type { ArchetypePresentation } from "#api/ranked/archetypes/ArchetypePresentation";

export type ResolvedArchetype = {
  archetype: string;
  presentation: ArchetypePresentation | null;
};
