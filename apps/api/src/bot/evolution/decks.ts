import { createHash } from "node:crypto";
import { ALL_FAMOUS_DECKS, getCardDefinition } from "@aegis/shared";
import { validateDecklist } from "../../engine/deckValidation.js";
import { getEffectModule } from "../../engine/effects/registry.js";
import digilabDecks from "#api/bot/evolution/digilab-decks.json" with { type: "json" };

export const EVOLUTION_DECK_VERSIONS = [
  "digilab-ex13-122980@1",
  "digilab-ex13-121547@1",
  "digilab-ex13-122110@1",
  "digilab-ex13-122675@1",
  "digilab-ex13-120207@1",
  "digilab-ex13-119771@1",
] as const;

export function evolutionDeck(version: string) {
  const source =
    ALL_FAMOUS_DECKS.find((deck) => deck.deckVersion === version || deck.deckId === version) ??
    digilabDecks.decks.find((deck) => deck.deckVersion === version);
  if (source === undefined) throw new Error(`Unknown evolution deck ${version}`);
  const deck = { mainDeck: [...source.decklist.mainDeck], eggDeck: [...source.decklist.eggDeck] };
  const legality = validateDecklist(deck);
  if (!legality.ok) throw new Error(`Illegal evolution deck ${version}: ${legality.reason}`);
  for (const id of [...deck.mainDeck, ...deck.eggDeck]) {
    const definition = getCardDefinition(id)!;
    if ((definition.effectText?.trim() || definition.inheritedEffectText?.trim()) && getEffectModule(id) === undefined)
      throw new Error(`Evolution deck has an unimplemented card: ${id}`);
  }
  return {
    id: version,
    name: source.name,
    deck,
    sha256: createHash("sha256").update(JSON.stringify(deck)).digest("hex"),
  };
}
