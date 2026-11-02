import type { ProviderDetail } from "@aegis/shared/deckProviders/ProviderTypes";
import type { DeckListing } from "@/game/decks";
import { dominantColor } from "@/game/decks";

export function getProviderDeckListing(detail: ProviderDetail): DeckListing | null {
  if (!detail.mainDeck || !detail.eggDeck || !detail.legality || detail.legality.unknownCards.length > 0) {
    return null;
  }
  return {
    id: `provider-${detail.id}`,
    name: detail.name,
    coverCardId: detail.coverCardId,
    color: dominantColor(detail.mainDeck),
    blurb: `DigiLab · ${detail.player ?? "—"} · ${detail.format ?? "—"}`,
    mainDeck: detail.mainDeck,
    eggDeck: detail.eggDeck,
  };
}
