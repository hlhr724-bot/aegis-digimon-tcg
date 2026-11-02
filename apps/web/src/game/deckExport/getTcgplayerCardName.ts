import type { CardDefinition } from "@aegis/shared/cards/types";
import cardNames from "@/game/deckExport/tcgplayerCardNames.json";

export function getTcgplayerCardName(card: Pick<CardDefinition, "cardId" | "nameEn">): string {
  if (Object.hasOwn(cardNames, card.cardId)) {
    return cardNames[card.cardId as keyof typeof cardNames];
  }
  return card.nameEn;
}
