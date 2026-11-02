import { isBetaOnlyCard } from "@aegis/shared/cards/cardPool";
import { getCardDefinition } from "@aegis/shared/cards/registry";

export function isBetaCard(cardId: string): boolean {
  const card = getCardDefinition(cardId);
  return card !== undefined && isBetaOnlyCard(card);
}
