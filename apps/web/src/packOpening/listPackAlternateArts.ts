import { getCardArts } from "@aegis/shared/cards/arts";
import { getPackCardRarity } from "@/packOpening/getPackCardRarity";
import type { PackCard } from "@/packOpening/PackCard";

type Params = {
  cards: readonly PackCard[];
  setId: string;
};

export function listPackAlternateArts({ cards, setId }: Params): PackCard[] {
  const setNumber = setId.replace(/\D/g, "");
  const family = setId.replace(/\d/g, "");
  const labelPrefix = new RegExp(`^${family}-?0*${Number(setNumber)}:`);
  return cards.flatMap((card) => {
    if (card.artId) {
      return [];
    }
    const art = getCardArts(card.cardId).find(
      (candidate) => candidate.artId === `${card.cardId}_P1` && labelPrefix.test((candidate.label ?? "").toUpperCase()),
    );
    if (!art) {
      return [];
    }
    return [{ ...card, rarity: getPackCardRarity({ card, setId }), artId: art.artId }];
  });
}
