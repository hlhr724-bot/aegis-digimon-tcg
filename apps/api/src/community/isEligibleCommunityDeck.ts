import { deckLegality, getCardDefinition } from "@aegis/shared";
import { isBetaOnlyCard } from "@aegis/shared/cards/cardPool";
import type { DeckFormat } from "@aegis/shared/deckFormat";

type Params = {
  deck: { mainDeck: readonly string[]; eggDeck: readonly string[] };
  format: DeckFormat | undefined;
  betaAllowed: boolean;
};

export function isEligibleCommunityDeck({ deck, format, betaAllowed }: Params): boolean {
  if (!deckLegality(deck, { format }).legal) return false;
  return (
    betaAllowed ||
    ![...deck.mainDeck, ...deck.eggDeck].some((id) => {
      const card = getCardDefinition(id);
      return card !== undefined && isBetaOnlyCard(card);
    })
  );
}
