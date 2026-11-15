import type { ArchetypeReferenceIndex } from "#api/ranked/archetypes/ArchetypeReferenceIndex";
import { UNIDENTIFIED_ARCHETYPE } from "#api/ranked/archetypes/UNIDENTIFIED_ARCHETYPE";
import { countDeckCards } from "#api/ranked/archetypes/countDeckCards";

type Params = { mainDeck: readonly string[]; index: ArchetypeReferenceIndex };

const MINIMUM_SHARED_CARDS = 25;

export function classifyDeckArchetype({ mainDeck, index }: Params): string {
  const sharedByReference = new Map<number, number>();
  for (const [card, copies] of countDeckCards(mainDeck)) {
    for (const entry of index.copiesByCard.get(card) ?? []) {
      sharedByReference.set(
        entry.reference,
        (sharedByReference.get(entry.reference) ?? 0) + Math.min(copies, entry.copies),
      );
    }
  }
  let archetype = UNIDENTIFIED_ARCHETYPE;
  let mostShared = 0;
  for (const [reference, shared] of sharedByReference) {
    const candidate = index.archetypes[reference]!;
    if (shared < MINIMUM_SHARED_CARDS) {
      continue;
    }
    if (shared > mostShared || (shared === mostShared && candidate < archetype)) {
      archetype = candidate;
      mostShared = shared;
    }
  }
  return archetype;
}
