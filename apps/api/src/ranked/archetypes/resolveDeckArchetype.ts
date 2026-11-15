import { ALL_FAMOUS_DECKS } from "@aegis/shared/decks/index";
import type { ArchetypeReferenceIndex } from "#api/ranked/archetypes/ArchetypeReferenceIndex";
import type { ResolvedArchetype } from "#api/ranked/archetypes/ResolvedArchetype";
import { UNIDENTIFIED_ARCHETYPE } from "#api/ranked/archetypes/UNIDENTIFIED_ARCHETYPE";
import { buildArchetypeReferenceIndex } from "#api/ranked/archetypes/buildArchetypeReferenceIndex";
import { classifyDeckArchetype } from "#api/ranked/archetypes/classifyDeckArchetype";
import { getDeckKeyDigimon } from "#api/ranked/archetypes/getDeckKeyDigimon";

type Params = { mainDeck: readonly string[]; providerIndex: ArchetypeReferenceIndex };

const SHOWN_COLORS = 2;

const FAMOUS_DECK_INDEX = buildArchetypeReferenceIndex(
  ALL_FAMOUS_DECKS.map((deck) => ({
    archetype: deck.archetype,
    mainDeck: deck.decklist.mainDeck,
    presentation: {
      coverCardId: getDeckKeyDigimon({ mainDeck: deck.decklist.mainDeck })?.cardId ?? null,
      colors: deck.colors.slice(0, SHOWN_COLORS),
    },
  })),
);

export function resolveDeckArchetype({ mainDeck, providerIndex }: Params): ResolvedArchetype {
  for (const index of [providerIndex, FAMOUS_DECK_INDEX]) {
    const archetype = classifyDeckArchetype({ mainDeck, index });
    if (archetype !== UNIDENTIFIED_ARCHETYPE) {
      return { archetype, presentation: index.presentationByArchetype.get(archetype) ?? null };
    }
  }
  const keyDigimon = getDeckKeyDigimon({ mainDeck });
  if (!keyDigimon) {
    return { archetype: UNIDENTIFIED_ARCHETYPE, presentation: null };
  }
  return {
    archetype: keyDigimon.nameEn,
    presentation: { coverCardId: keyDigimon.cardId, colors: keyDigimon.colors.slice(0, SHOWN_COLORS) },
  };
}
