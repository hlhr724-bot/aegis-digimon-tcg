import type { ProviderList } from "@aegis/shared/deckProviders/ProviderTypes";
import type { DeckListing } from "@/game/decks";
import { colorKey } from "@/design/theme";

export function getProviderTileListing(deck: ProviderList): DeckListing {
  return {
    id: `provider-${deck.id}`,
    name: deck.name,
    color: colorKey(deck.colors[0]),
    blurb: [deck.player, deck.format].filter(Boolean).join(" · "),
    mainDeck: [],
    eggDeck: [],
    coverCardId: deck.coverCardId,
  };
}
