import { getTcgplayerCardName } from "@/game/deckExport/getTcgplayerCardName";
import { allCards, getCardDefinition } from "@aegis/shared/cards/registry";
import type { DeckListing } from "@/game/decks";
import { getTcgplayerSetCode } from "@/game/deckExport/getTcgplayerSetCode";

const nameCounts = new Map<string, number>();
for (const card of allCards()) {
  const setCode = getTcgplayerSetCode(card);
  if (setCode) {
    const key = `${setCode}:${getTcgplayerCardName(card).toLowerCase()}`;
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
}

export function serializeTcgplayerDeckList(deck: Pick<DeckListing, "mainDeck" | "eggDeck">) {
  const counts = new Map<string, number>();
  for (const id of [...deck.eggDeck, ...deck.mainDeck]) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const ids = new Set([...deck.eggDeck].sort().concat([...deck.mainDeck].sort()));
  const lines: string[] = [];
  const unsupportedCards: string[] = [];
  for (const cardId of ids) {
    const card = getCardDefinition(cardId);
    const setCode = card && getTcgplayerSetCode(card);
    if (!card || !setCode) {
      unsupportedCards.push(card ? `${card.nameEn} (${cardId})` : cardId);
      continue;
    }
    const ambiguous = (nameCounts.get(`${setCode}:${getTcgplayerCardName(card).toLowerCase()}`) ?? 0) > 1;
    const number = ambiguous ? ` ${cardId}` : "";
    lines.push(`${counts.get(cardId)} ${getTcgplayerCardName(card)} [${setCode}]${number}`);
  }
  return { text: lines.join("\n"), unsupportedCards };
}
