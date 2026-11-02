import { ALL_FAMOUS_DECKS } from "@aegis/shared";
import type { BeliefDeck } from "#api/bot/evolution/BeliefDeck";
import digilabDecks from "#api/bot/evolution/digilab-decks.json" with { type: "json" };

function buildBeliefDeckCatalog(): readonly BeliefDeck[] {
  const metaWeights = new Map<string, { name: string; weight: number }>();
  for (const format of digilabDecks.meta) {
    for (const archetype of format.archetypes) {
      metaWeights.set(`${format.format}:${archetype.archetype_id}`, {
        name: archetype.archetype_name,
        weight: Math.max(0.05, archetype.meta_pct),
      });
    }
  }
  const famous = ALL_FAMOUS_DECKS.filter(
    (deck) => deck.decklist.mainDeck.length === 50 && deck.decklist.eggDeck.length > 0,
  ).map((deck) => ({
    id: deck.deckVersion,
    archetype: deck.archetype,
    weight: 1,
    mainDeck: deck.decklist.mainDeck,
    eggDeck: deck.decklist.eggDeck,
  }));
  const digilab = digilabDecks.decks
    .filter(
      (deck) =>
        deck.decklist.mainDeck.length === 50 && deck.decklist.eggDeck.length > 0 && deck.decklist.eggDeck.length <= 5,
    )
    .map((deck) => {
      const meta = metaWeights.get(`${deck.format}:${deck.archetypeId}`);
      return {
        id: deck.deckVersion,
        archetype: meta?.name ?? deck.name,
        weight: meta?.weight ?? 0.1,
        mainDeck: deck.decklist.mainDeck,
        eggDeck: deck.decklist.eggDeck,
      };
    });
  const decks = [...famous, ...digilab];
  const deckCountByArchetype = new Map<string, number>();
  for (const deck of decks) {
    deckCountByArchetype.set(deck.archetype, (deckCountByArchetype.get(deck.archetype) ?? 0) + 1);
  }
  return decks.map((deck) =>
    Object.freeze({
      ...deck,
      weight: deck.weight / deckCountByArchetype.get(deck.archetype)!,
    }),
  );
}

const CATALOG = buildBeliefDeckCatalog();

export function beliefDeckCatalog(): readonly BeliefDeck[] {
  return CATALOG;
}
