import { ALL_FAMOUS_DECKS } from "@aegis/shared/decks/index";
import { evolutionDeck } from "#api/bot/evolution/decks";
import digilabDecks from "#api/bot/evolution/digilab-decks.json" with { type: "json" };

export function evolutionPilotDecks() {
  const available: ReturnType<typeof evolutionDeck>[] = [];
  const excluded: { id: string; reason: string }[] = [];
  const seen = new Set<string>();
  for (const source of [...ALL_FAMOUS_DECKS, ...digilabDecks.decks]) {
    if (seen.has(source.deckVersion)) continue;
    seen.add(source.deckVersion);
    try {
      available.push(evolutionDeck(source.deckVersion));
    } catch (error) {
      excluded.push({ id: source.deckVersion, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { available, excluded };
}
